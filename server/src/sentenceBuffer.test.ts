import { describe, expect, it } from 'vitest';
import { SentenceBuffer, type FinalizedSentence } from './sentenceBuffer.js';

function consume(input: string, chunkSize?: number): FinalizedSentence[] {
  const buf = new SentenceBuffer();
  const out: FinalizedSentence[] = [];
  if (chunkSize) {
    for (let i = 0; i < input.length; i += chunkSize) {
      out.push(...buf.push(input.slice(i, i + chunkSize)));
    }
  } else {
    out.push(...buf.push(input));
  }
  out.push(...buf.flush());
  return out;
}

describe('SentenceBuffer', () => {
  it('splits a simple two-sentence stream', () => {
    const finished = consume('Hello world. How are you? ');
    expect(finished.map((s) => s.text)).toEqual(['Hello world.', 'How are you?']);
    expect(finished[0]!.index).toBe(0);
    expect(finished[1]!.index).toBe(1);
  });

  it('preserves character offsets bracketing each sentence', () => {
    const text = 'First sentence. Second one!';
    const finished = consume(text);
    expect(finished).toHaveLength(2);
    for (const s of finished) {
      expect(s.end).toBeGreaterThan(s.start);
      expect(s.end).toBeLessThanOrEqual(text.length);
    }
  });

  it('does not split on common abbreviations', () => {
    const finished = consume('Dr. Smith met Mr. Jones at 5 p.m. Then they left. ');
    expect(finished).toHaveLength(2);
    expect(finished[0]!.text).toContain('Dr. Smith');
    expect(finished[0]!.text).toContain('Mr. Jones');
    expect(finished[1]!.text).toBe('Then they left.');
  });

  it('handles chunked input where a sentence is split mid-stream', () => {
    const buf = new SentenceBuffer();
    expect(buf.push('Hello ')).toEqual([]);
    expect(buf.push('world. And ')).toEqual([
      expect.objectContaining({ text: 'Hello world.', index: 0 }),
    ]);
    const rest = buf.flush();
    expect(rest.map((s) => s.text)).toEqual(['And']);
  });

  it('produces the same sentences regardless of chunk boundaries', () => {
    const text = 'One sentence. Another sentence! A third one? ';
    const wholeAtOnce = consume(text).map((s) => s.text);
    const byteByByte = consume(text, 1).map((s) => s.text);
    const inThrees = consume(text, 3).map((s) => s.text);
    expect(wholeAtOnce).toEqual(['One sentence.', 'Another sentence!', 'A third one?']);
    expect(byteByByte).toEqual(wholeAtOnce);
    expect(inThrees).toEqual(wholeAtOnce);
  });

  it('flush emits a final incomplete sentence with no terminator', () => {
    const finished = consume('No punctuation here');
    expect(finished.map((s) => s.text)).toEqual(['No punctuation here']);
  });

  it('treats ! and ? as sentence terminators', () => {
    const finished = consume('Wow! Really? Yes. ');
    expect(finished.map((s) => s.text)).toEqual(['Wow!', 'Really?', 'Yes.']);
  });

  it('does not emit empty sentences for repeated whitespace', () => {
    const finished = consume('One.   Two.   Three.   ');
    expect(finished.map((s) => s.text)).toEqual(['One.', 'Two.', 'Three.']);
  });
});
