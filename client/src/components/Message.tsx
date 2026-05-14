import { useMemo } from 'react';
import type { ClientMessage, ClientSentence } from '../store';
import { Sentence } from './Sentence';

type Props = {
  message: ClientMessage;
  onOpenConflict: (sentence: ClientSentence) => void;
};

export function Message({ message, onOpenConflict }: Props) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl rounded-2xl rounded-br-sm bg-stone-900 px-4 py-2 text-stone-50">
          {message.content}
        </div>
      </div>
    );
  }
  return <AssistantMessage message={message} onOpenConflict={onOpenConflict} />;
}

type AssistantMessageType = Extract<ClientMessage, { role: 'assistant' }>;

function AssistantMessage({
  message,
  onOpenConflict,
}: {
  message: AssistantMessageType;
  onOpenConflict: (sentence: ClientSentence) => void;
}) {
  const sentences = message.sentences.slice().sort((a, b) => a.index - b.index);
  const counts = useMemo(() => {
    const c = { supported: 0, partial: 0, unsupported: 0, contradicted: 0, pending: 0 };
    for (const s of sentences) {
      if (!s.verdict) c.pending++;
      else c[s.verdict.status]++;
    }
    return c;
  }, [sentences]);

  const trailingText = useMemo(() => {
    const total = sentences.reduce((acc, s) => acc + s.text.length, 0);
    if (total >= message.streamingText.length) return '';
    return message.streamingText.slice(total).trim();
  }, [sentences, message.streamingText]);

  return (
    <div className="flex justify-start">
      <div className="w-full max-w-3xl space-y-3 rounded-2xl rounded-bl-sm border border-stone-200 bg-white/95 px-5 py-4 shadow-sm ring-1 ring-stone-100/60 backdrop-blur-sm">
        <div className="text-sm leading-relaxed text-stone-800">
          {sentences.map((s) => (
            <Sentence
              key={s.index}
              sentence={s}
              sources={message.sources}
              onOpenConflict={onOpenConflict}
            />
          ))}
          {trailingText && (
            <span className="text-stone-400">{trailingText}</span>
          )}
          {message.status === 'streaming' && (
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-stone-400 align-middle" />
          )}
        </div>

        {sentences.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-t border-stone-100 pt-2 text-[11px] text-stone-500">
            <span className="font-semibold uppercase tracking-wide text-stone-400">
              trust summary
            </span>
            <Pill color="emerald" label={`${counts.supported} supported`} />
            {counts.partial > 0 && <Pill color="amber" label={`${counts.partial} partial`} />}
            {counts.unsupported > 0 && <Pill color="rose" label={`${counts.unsupported} unsupported`} />}
            {counts.contradicted > 0 && (
              <Pill color="rose-strong" label={`${counts.contradicted} contradicted ⚡`} />
            )}
            {counts.pending > 0 && <Pill color="stone" label={`${counts.pending} verifying…`} />}
          </div>
        )}

        {message.sources.length > 0 && (
          <ol className="space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
            <div className="mb-1 font-semibold uppercase tracking-wide text-stone-400">
              sources
            </div>
            {message.sources.map((s, idx) => (
              <li key={s.id} className="flex gap-2">
                <span className="font-mono text-stone-400">[{idx + 1}]</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-stone-700 hover:underline"
                  title={s.url}
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        )}

        {message.status === 'error' && (
          <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            error: {message.errorMessage}
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ color, label }: { color: 'emerald' | 'amber' | 'rose' | 'rose-strong' | 'stone'; label: string }) {
  const palette: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    rose: 'bg-rose-100 text-rose-800',
    'rose-strong': 'bg-rose-200 text-rose-900 font-medium',
    stone: 'bg-stone-100 text-stone-700',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] ${palette[color]}`}>
      {label}
    </span>
  );
}
