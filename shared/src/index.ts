export type Source = {
  id: string;
  url: string;
  title: string;
  pageAge?: string;
};

export type CitedSpan = {
  sourceId: string;
  citedText: string;
};

export type VerdictStatus =
  | 'supported'
  | 'partial'
  | 'unsupported'
  | 'contradicted';

export type Verdict = {
  status: VerdictStatus;
  rationale: string;
  supportingSourceId?: string;
  supportingQuote?: string;
  conflictingSourceId?: string;
  conflictingQuote?: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type ServerEvent =
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'citation'; sourceId: string; citedText: string }
  | { type: 'sentence_end'; index: number; text: string; citations: CitedSpan[] }
  | { type: 'sentence_verdict'; index: number; verdict: Verdict }
  | { type: 'done' }
  | { type: 'error'; message: string };

export type ChatRequest = {
  messages: ChatMessage[];
};
