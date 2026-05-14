const ABBREVS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'jr', 'sr', 'st', 'prof',
  'eg', 'ie', 'etc', 'vs', 'cf', 'al',
  'inc', 'ltd', 'co', 'corp',
  'fig', 'no', 'vol', 'pp',
  'u.s', 'u.k', 'e.u',
]);

export type FinalizedSentence = {
  index: number;
  text: string;
  start: number;
  end: number;
};

export class SentenceBuffer {
  private cumulative = '';
  private pendingStart = 0;
  private nextIndex = 0;

  get cumulativeLength(): number {
    return this.cumulative.length;
  }

  push(chunk: string): FinalizedSentence[] {
    if (!chunk) return [];
    this.cumulative += chunk;
    return this.scanFromPending();
  }

  flush(): FinalizedSentence[] {
    const out: FinalizedSentence[] = [];
    if (this.pendingStart < this.cumulative.length) {
      const text = this.cumulative.slice(this.pendingStart).trim();
      if (text.length > 0) {
        out.push({
          index: this.nextIndex++,
          text,
          start: this.pendingStart,
          end: this.cumulative.length,
        });
      }
      this.pendingStart = this.cumulative.length;
    }
    return out;
  }

  private scanFromPending(): FinalizedSentence[] {
    const out: FinalizedSentence[] = [];
    const text = this.cumulative;
    let i = this.pendingStart;

    while (i < text.length) {
      const ch = text[i];
      if (ch === '.' || ch === '!' || ch === '?') {
        let endPos = i + 1;
        const next = text[endPos];
        if (next === '"' || next === "'" || next === ')' || next === ']') {
          endPos++;
        }
        const after = text[endPos];
        const isEnd = after === undefined || after === ' ' || after === '\n' || after === '\t';

        if (after === undefined) {
          break;
        }

        if (isEnd && !this.isAbbreviation(i)) {
          const sentenceText = text.slice(this.pendingStart, endPos).trim();
          if (sentenceText.length > 0) {
            out.push({
              index: this.nextIndex++,
              text: sentenceText,
              start: this.pendingStart,
              end: endPos,
            });
          }
          while (endPos < text.length && /\s/.test(text[endPos]!)) endPos++;
          this.pendingStart = endPos;
          i = endPos;
          continue;
        }
      }
      i++;
    }

    return out;
  }

  private isAbbreviation(periodIdx: number): boolean {
    if (this.cumulative[periodIdx] !== '.') return false;
    let start = periodIdx - 1;
    while (start >= 0 && /[A-Za-z.]/.test(this.cumulative[start]!)) start--;
    const word = this.cumulative.slice(start + 1, periodIdx).toLowerCase();
    if (!word) return false;
    if (ABBREVS.has(word)) return true;
    if (word.length === 1) return true;
    if (/^\d+$/.test(word)) return true;
    return false;
  }
}
