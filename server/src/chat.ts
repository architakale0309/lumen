import Anthropic from '@anthropic-ai/sdk';
import type { CitedSpan, ChatMessage, Source } from '@lumen/shared';
import { SentenceBuffer, type FinalizedSentence } from './sentenceBuffer.js';
import { SseWriter } from './sse.js';
import { Semaphore, verifyClaim } from './verifier.js';

const PRIMARY_MODEL = process.env.PRIMARY_MODEL ?? 'claude-opus-4-7';
const MAX_VERIFIER_CONCURRENCY = Number(process.env.MAX_VERIFIER_CONCURRENCY ?? 6);
const MAX_OUTPUT_TOKENS = Number(process.env.MAX_OUTPUT_TOKENS ?? 4096);

const SYSTEM_PROMPT = `You are a helpful research assistant. Use the web_search tool to ground your answers in current sources.

Guidelines:
- Answer in short, clear sentences. Avoid one giant paragraph — break thoughts apart with periods so each claim is its own sentence.
- Attach factual claims to retrieved sources whenever possible.
- When sources disagree, say so explicitly in a dedicated sentence.
- Avoid filler ("Let me search for that...") — get to the answer.`;

type CitationRecord = {
  sourceId: string;
  citedText: string;
  responseStart: number;
  responseEnd: number;
};

export async function streamChat(
  messages: ChatMessage[],
  writer: SseWriter,
): Promise<void> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' });

  const sentenceBuf = new SentenceBuffer();
  const sentences: FinalizedSentence[] = [];

  const sources = new Map<string, Source>();
  const urlToSourceId = new Map<string, string>();
  const citationRecords: CitationRecord[] = [];

  const emitSentenceEnd = (s: FinalizedSentence) => {
    sentences.push(s);
    writer.send({
      type: 'sentence_end',
      index: s.index,
      text: s.text,
      citations: [],
    });
  };

  const registerSource = (url: string, title?: string): string => {
    const existing = urlToSourceId.get(url);
    if (existing) return existing;
    const id = `s${sources.size + 1}`;
    sources.set(id, { id, url, title: title || url });
    urlToSourceId.set(url, id);
    return id;
  };

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    const stream = client.messages.stream({
      model: PRIMARY_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
      messages: apiMessages,
    });

    let cumulativeText = '';
    let currentBlockTextStart = 0;
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        currentBlockTextStart = cumulativeText.length;
      } else if (event.type === 'content_block_delta') {
        const delta = event.delta as Anthropic.RawContentBlockDeltaEvent['delta'];
        if (delta.type === 'text_delta') {
          const text = delta.text;
          cumulativeText += text;
          writer.send({ type: 'token', text });
          const finished = sentenceBuf.push(text);
          for (const s of finished) emitSentenceEnd(s);
        } else if (delta.type === 'citations_delta') {
          const citation = (delta as { citation: unknown }).citation as
            | {
                type?: string;
                url?: string;
                title?: string;
                cited_text?: string;
                start_char_index?: number;
                end_char_index?: number;
              }
            | undefined;
          if (citation?.url && citation.cited_text) {
            const sourceId = registerSource(citation.url, citation.title);
            const localStart = citation.start_char_index ?? 0;
            const localEnd = citation.end_char_index ?? cumulativeText.length - currentBlockTextStart;
            citationRecords.push({
              sourceId,
              citedText: citation.cited_text,
              responseStart: currentBlockTextStart + localStart,
              responseEnd: currentBlockTextStart + localEnd,
            });
            writer.send({
              type: 'citation',
              sourceId,
              citedText: citation.cited_text,
            });
          }
        }
      }
    }

    for (const s of sentenceBuf.flush()) emitSentenceEnd(s);

    // Final message backfill in case any citation arrived only at message close
    const finalMessage = await stream.finalMessage();
    for (const block of finalMessage.content) {
      if (block.type !== 'text' || !block.citations) continue;
      for (const c of block.citations) {
        if (c.type !== 'web_search_result_location') continue;
        const { url, cited_text: citedText, title } = c;
        if (!url || !citedText) continue;
        const alreadyRecorded = citationRecords.some(
          (r) => r.citedText === citedText && sources.get(r.sourceId)?.url === url,
        );
        if (alreadyRecorded) continue;
        const sourceId = registerSource(url, title ?? undefined);
        citationRecords.push({
          sourceId,
          citedText,
          responseStart: -1,
          responseEnd: -1,
        });
        writer.send({ type: 'citation', sourceId, citedText });
      }
    }

    if (sources.size > 0) {
      writer.send({ type: 'sources', sources: Array.from(sources.values()) });
    }

    // Index citations by source, and map each sentence to its overlapping citations.
    const citationsBySource = new Map<string, string[]>();
    for (const r of citationRecords) {
      const list = citationsBySource.get(r.sourceId) ?? [];
      if (!list.includes(r.citedText)) list.push(r.citedText);
      citationsBySource.set(r.sourceId, list);
    }

    const sentenceCitations = new Map<number, CitedSpan[]>();
    for (const s of sentences) {
      const attached: CitedSpan[] = [];
      for (const r of citationRecords) {
        if (r.responseStart < 0) continue;
        if (r.responseStart < s.end && r.responseEnd > s.start) {
          attached.push({ sourceId: r.sourceId, citedText: r.citedText });
        }
      }
      sentenceCitations.set(s.index, attached);
    }

    const semaphore = new Semaphore(MAX_VERIFIER_CONCURRENCY);
    const allSources = Array.from(sources.values());

    const verifierTasks = sentences.map((s) =>
      (async () => {
        const release = await semaphore.acquire();
        try {
          if (allSources.length === 0) {
            writer.send({
              type: 'sentence_verdict',
              index: s.index,
              verdict: { status: 'unsupported', rationale: 'no sources retrieved' },
            });
            return;
          }

          const attached = sentenceCitations.get(s.index) ?? [];
          const verdict = await verifyClaim({
            claim: s.text,
            attachedCitations: attached,
            allSources,
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
      })(),
    );

    await Promise.allSettled(verifierTasks);
    writer.send({ type: 'done' });
  } catch (err) {
    writer.send({ type: 'error', message: (err as Error).message });
    writer.send({ type: 'done' });
  } finally {
    writer.close();
  }
}
