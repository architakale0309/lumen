import { create } from 'zustand';
import type {
  CitedSpan,
  ServerEvent,
  Source,
  Verdict,
} from '@lumen/shared';

const ACCESS_TOKEN_KEY = 'lumen_access_token';

function loadAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  const match = hash.match(/[#&]token=([^&]+)/);
  if (match) {
    const token = decodeURIComponent(match[1]);
    try {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } catch {
      // localStorage may be unavailable (private mode, blocked) — token still works for this session
    }
    const cleanedHash = hash.replace(/([#&])?token=[^&]+/, '$1').replace(/^#$/, '');
    window.history.replaceState(null, '', window.location.pathname + window.location.search + cleanedHash);
    return token;
  }
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

const ACCESS_TOKEN = loadAccessToken();

export type ClientSentence = {
  index: number;
  text: string;
  citations: CitedSpan[];
  verdict: Verdict | null;
};

export type ClientMessage =
  | {
      id: string;
      role: 'user';
      content: string;
    }
  | {
      id: string;
      role: 'assistant';
      streamingText: string;
      sentences: ClientSentence[];
      sources: Source[];
      status: 'streaming' | 'verifying' | 'done' | 'error';
      errorMessage?: string;
    };

type Store = {
  messages: ClientMessage[];
  isSending: boolean;
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
};

let messageCounter = 0;
const nextId = () => `m${++messageCounter}`;

export const useStore = create<Store>((set, get) => ({
  messages: [],
  isSending: false,

  reset: () => set({ messages: [], isSending: false }),

  sendMessage: async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || get().isSending) return;

    const userMsg: ClientMessage = {
      id: nextId(),
      role: 'user',
      content: trimmed,
    };
    const assistantId = nextId();
    const assistantMsg: ClientMessage = {
      id: assistantId,
      role: 'assistant',
      streamingText: '',
      sentences: [],
      sources: [],
      status: 'streaming',
    };

    const history = get().messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.status === 'done'))
      .map((m) =>
        m.role === 'user'
          ? { role: 'user' as const, content: m.content }
          : { role: 'assistant' as const, content: m.streamingText },
      );

    set({
      messages: [...get().messages, userMsg, assistantMsg],
      isSending: true,
    });

    const requestBody = JSON.stringify({
      messages: [...history, { role: 'user', content: trimmed }],
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(ACCESS_TOKEN ? { 'X-Lumen-Token': ACCESS_TOKEN } : {}),
        },
        body: requestBody,
      });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
      }
      await consumeSse(response.body, (event) => applyEvent(set, get, assistantId, event));
      patchAssistant(set, get, assistantId, (m) => {
        if (m.status === 'streaming' || m.status === 'verifying') {
          return { ...m, status: 'done' };
        }
        return m;
      });
    } catch (err) {
      patchAssistant(set, get, assistantId, (m) => ({
        ...m,
        status: 'error',
        errorMessage: (err as Error).message,
      }));
    } finally {
      set({ isSending: false });
    }
  },
}));

function applyEvent(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
  assistantId: string,
  event: ServerEvent,
) {
  switch (event.type) {
    case 'sources':
      patchAssistant(set, get, assistantId, (m) => ({ ...m, sources: event.sources }));
      break;
    case 'token':
      patchAssistant(set, get, assistantId, (m) => ({
        ...m,
        streamingText: m.streamingText + event.text,
      }));
      break;
    case 'sentence_end':
      patchAssistant(set, get, assistantId, (m) => {
        if (m.sentences.find((s) => s.index === event.index)) return m;
        const next: ClientSentence = {
          index: event.index,
          text: event.text,
          citations: event.citations,
          verdict: null,
        };
        return { ...m, sentences: [...m.sentences, next] };
      });
      break;
    case 'sentence_verdict':
      patchAssistant(set, get, assistantId, (m) => ({
        ...m,
        sentences: m.sentences.map((s) =>
          s.index === event.index ? { ...s, verdict: event.verdict } : s,
        ),
      }));
      break;
    case 'done':
      patchAssistant(set, get, assistantId, (m) => ({ ...m, status: 'done' }));
      break;
    case 'error':
      patchAssistant(set, get, assistantId, (m) => ({
        ...m,
        status: 'error',
        errorMessage: event.message,
      }));
      break;
    case 'citation':
      break;
  }
}

function patchAssistant(
  set: (partial: Partial<Store>) => void,
  get: () => Store,
  id: string,
  fn: (m: Extract<ClientMessage, { role: 'assistant' }>) => Extract<ClientMessage, { role: 'assistant' }>,
) {
  const messages = get().messages.map((m) => {
    if (m.id !== id || m.role !== 'assistant') return m;
    return fn(m);
  });
  set({ messages });
}

async function consumeSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ServerEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of block.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          const event = JSON.parse(payload) as ServerEvent;
          onEvent(event);
        } catch (err) {
          console.warn('bad SSE payload', payload, err);
        }
      }
    }
  }
}
