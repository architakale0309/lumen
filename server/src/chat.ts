import { GoogleGenAI } from '@google/genai';
import type { CitedSpan, ChatMessage, Source } from '@lumen/shared';
import { SentenceBuffer, type FinalizedSentence } from './sentenceBuffer.js';
import { SseWriter } from './sse.js';
import { Semaphore, verifyClaim } from './verifier.js';
import { fetchPage, findBestSnippet } from './pageFetcher.js';

const PRIMARY_MODEL = process.env.PRIMARY_MODEL ?? 'gemini-2.5-pro';
const MAX_VERIFIER_CONCURRENCY = Number(process.env.MAX_VERIFIER_CONCURRENCY ?? 6);

const SYSTEM_PROMPT = `You are a helpful research assistant. Use Google Search to ground your answers in current sources.

Guidelines:
- Answer in short, clear sentences. Avoid one giant paragraph — break thoughts apart with periods so each claim is its own sentence.
- Attach factual claims to retrieved sources whenever possible.
- When sources disagree, say so explicitly in a dedicated sentence.
- Avoid filler ("Let me search for that...") — get to the answer.`;

type GroundingChunk = { web?: { uri?: string; title?: string } };
type GroundingSupport = {
  segment?: { startIndex?: number; endIndex?: number; text?: string };
  groundingChunkIndices?: number[];
};

export async function streamChat(
  messages: ChatMessage[],
  writer: SseWriter,
): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? '' });

  const sentenceBuf = new SentenceBuffer();
  const sentences: FinalizedSentence[] = [];
  let latestGrounding: {
    chunks: GroundingChunk[];
    supports: GroundingSupport[];
  } | null = null;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const emitSentenceEnd = (s: FinalizedSentence) => {
    sentences.push(s);
    writer.send({
      type: 'sentence_end',
      index: s.index,
      text: s.text,
      citations: [],
    });
  };

  let stream;
  try {
    stream = await ai.models.generateContentStream({
      model: PRIMARY_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }],
      },
    });
  } catch (err) {
    writer.send({
      type: 'error',
      message: `failed to start stream: ${(err as Error).message}`,
    });
    writer.send({ type: 'done' });
    writer.close();
    return;
  }

  try {
    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        writer.send({ type: 'token', text });
        const finished = sentenceBuf.push(text);
        for (const s of finished) emitSentenceEnd(s);
      }
      const gm = chunk.candidates?.[0]?.groundingMetadata;
      if (gm) {
        latestGrounding = {
          chunks: (gm.groundingChunks ?? []) as GroundingChunk[],
          supports: (gm.groundingSupports ?? []) as GroundingSupport[],
        };
      }
    }
    for (const s of sentenceBuf.flush()) emitSentenceEnd(s);

    // Build source list from grounding chunks
    const sources = new Map<string, Source>();
    const chunkIndexToSourceId = new Map<number, string>();
    if (latestGrounding) {
      latestGrounding.chunks.forEach((c, i) => {
        const web = c.web;
        if (!web?.uri) return;
        const id = `s${sources.size + 1}`;
        sources.set(id, {
          id,
          url: web.uri,
          title: web.title || web.uri,
        });
        chunkIndexToSourceId.set(i, id);
      });
    }
    if (sources.size > 0) {
      writer.send({ type: 'sources', sources: Array.from(sources.values()) });
    }

    // Map each sentence to grounded source ids via segment overlap
    const sentenceSources = new Map<number, Set<string>>();
    if (latestGrounding) {
      for (const s of sentences) {
        const set = new Set<string>();
        for (const sup of latestGrounding.supports) {
          const seg = sup.segment;
          if (!seg) continue;
          const segStart = seg.startIndex ?? -1;
          const segEnd = seg.endIndex ?? -1;
          if (segStart < 0 || segEnd < 0) continue;
          if (segStart < s.end && segEnd > s.start) {
            for (const idx of sup.groundingChunkIndices ?? []) {
              const sid = chunkIndexToSourceId.get(idx);
              if (sid) set.add(sid);
            }
          }
        }
        sentenceSources.set(s.index, set);
      }
    }

    // For each sentence: fetch grounded pages, extract snippet, verify
    const semaphore = new Semaphore(MAX_VERIFIER_CONCURRENCY);
    const citationsBySource = new Map<string, string[]>();
    const verifierTasks: Promise<void>[] = [];

    for (const s of sentences) {
      const sourceIds = Array.from(sentenceSources.get(s.index) ?? new Set<string>());
      const task = (async () => {
        const release = await semaphore.acquire();
        try {
          if (sources.size === 0) {
            writer.send({
              type: 'sentence_verdict',
              index: s.index,
              verdict: { status: 'unsupported', rationale: 'no sources retrieved' },
            });
            return;
          }
          if (sourceIds.length === 0) {
            writer.send({
              type: 'sentence_verdict',
              index: s.index,
              verdict: { status: 'unsupported', rationale: 'no grounding for this sentence' },
            });
            return;
          }

          const attached: CitedSpan[] = [];
          await Promise.all(
            sourceIds.map(async (sid) => {
              const src = sources.get(sid);
              if (!src) return;
              const page = await fetchPage(src.url);
              if (!page) return;
              const snippet = findBestSnippet(s.text, page.sentences);
              if (!snippet) return;
              attached.push({ sourceId: sid, citedText: snippet });
              const list = citationsBySource.get(sid) ?? [];
              list.push(snippet);
              citationsBySource.set(sid, list);
              writer.send({ type: 'citation', sourceId: sid, citedText: snippet });
            }),
          );

          const verdict = await verifyClaim({
            claim: s.text,
            attachedCitations: attached,
            allSources: Array.from(sources.values()),
            allCitations: citationsBySource,
          });
          writer.send({ type: 'sentence_verdict', index: s.index, verdict });
        } catch (err) {
          writer.send({
            type: 'sentence_verdict',
            index: s.index,
            verdict: {
              status: 'unsupported',
              rationale: `verifier failed: ${(err as Error).message}`,
            },
          });
        } finally {
          release();
        }
      })();
      verifierTasks.push(task);
    }

    await Promise.allSettled(verifierTasks);
    writer.send({ type: 'done' });
  } catch (err) {
    writer.send({ type: 'error', message: (err as Error).message });
    writer.send({ type: 'done' });
  } finally {
    writer.close();
  }
}
