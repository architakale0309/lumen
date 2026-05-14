import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export type FetchedPage = {
  url: string;
  text: string;
  sentences: string[];
};

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const USER_AGENT =
  'Mozilla/5.0 (compatible; LumenBot/0.1; +https://example.com/bot) AppleWebKit/537.36';

const cache = new Map<string, Promise<FetchedPage | null>>();

export async function fetchPage(url: string): Promise<FetchedPage | null> {
  const existing = cache.get(url);
  if (existing) return existing;
  const promise = doFetch(url);
  cache.set(url, promise);
  return promise;
}

async function doFetch(url: string): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok || !res.body) return null;
    const ctype = res.headers.get('content-type') ?? '';
    if (!ctype.toLowerCase().includes('html')) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        chunks.push(value);
        if (total > MAX_BYTES) {
          reader.cancel().catch(() => {});
          break;
        }
      }
    }
    const html = new TextDecoder().decode(concatChunks(chunks));

    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const raw = article?.textContent ?? dom.window.document.body?.textContent ?? '';
    const text = raw.replace(/\s+/g, ' ').trim();
    if (text.length < 80) return null;

    return { url, text, sentences: splitIntoSentences(text) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

function splitIntoSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length >= 30 && p.length <= 600);
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can',
  'her', 'was', 'one', 'our', 'out', 'use', 'has', 'had', 'how', 'its',
  'who', 'did', 'get', 'him', 'his', 'she', 'they', 'them', 'this', 'that',
  'with', 'from', 'have', 'were', 'been', 'will', 'would', 'could', 'should',
  'there', 'their', 'these', 'those', 'than', 'then', 'when', 'what', 'where',
  'which', 'while', 'about', 'after', 'before', 'into', 'over', 'some', 'such',
  'also', 'more', 'most', 'much', 'only', 'other', 'very', 'just', 'because',
]);

export function findBestSnippet(
  claim: string,
  sourceSentences: string[],
): string | null {
  const claimTokens = tokenize(claim);
  if (claimTokens.size === 0 || sourceSentences.length === 0) return null;

  let best: { score: number; sentence: string } | null = null;
  for (const s of sourceSentences) {
    const srcTokens = tokenize(s);
    if (srcTokens.size === 0) continue;
    let overlap = 0;
    for (const t of claimTokens) if (srcTokens.has(t)) overlap++;
    const score = overlap / Math.min(claimTokens.size, srcTokens.size);
    if (!best || score > best.score) best = { score, sentence: s };
  }
  if (!best || best.score < 0.18) return null;
  return best.sentence.length > 240
    ? best.sentence.slice(0, 237) + '…'
    : best.sentence;
}

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w)));
}
