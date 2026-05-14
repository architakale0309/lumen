import { useEffect, useRef, useState } from 'react';
import { useStore, type ClientSentence } from '../store';
import { Message } from './Message';
import { ConflictModal } from './ConflictModal';

export function Chat() {
  const messages = useStore((s) => s.messages);
  const isSending = useStore((s) => s.isSending);
  const [conflictSentence, setConflictSentence] = useState<ClientSentence | null>(null);
  const conflictSourcesRef = useRef<{ sentence: ClientSentence; sources: any[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isSending]);

  const openConflict = (sentence: ClientSentence) => {
    const owner = messages.find(
      (m) => m.role === 'assistant' && m.sentences.some((s) => s.index === sentence.index && s.text === sentence.text),
    );
    if (owner && owner.role === 'assistant') {
      conflictSourcesRef.current = { sentence, sources: owner.sources };
    }
    setConflictSentence(sentence);
  };

  const closeConflict = () => {
    setConflictSentence(null);
    conflictSourcesRef.current = null;
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-stone-200 bg-white/70 px-6 py-10 text-center shadow-sm backdrop-blur-sm">
            <div className="mx-auto mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10 2a6 6 0 00-3.5 10.86V15a1 1 0 001 1h5a1 1 0 001-1v-2.14A6 6 0 0010 2zm-2 16a1 1 0 100 2h4a1 1 0 100-2H8z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
              Ask anything. Trust the answer.
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-stone-600">
              A research agent searches the web while a second model fact-checks every sentence against
              the retrieved sources — live, in front of you.
            </p>
            <div className="mx-auto mt-6 grid max-w-md grid-cols-1 gap-2 text-left text-xs text-stone-600 sm:grid-cols-2">
              <Legend bg="bg-emerald-100" fg="text-emerald-800" icon="✓" text="supported by sources" />
              <Legend bg="bg-amber-100" fg="text-amber-800" icon="~" text="partially supported" />
              <Legend bg="bg-rose-100" fg="text-rose-800" icon="✗" text="no source support" />
              <Legend bg="bg-rose-200" fg="text-rose-900" icon="⚡" text="sources disagree" />
            </div>
          </div>
        )}
        {messages.map((m) => (
          <Message key={m.id} message={m} onOpenConflict={openConflict} />
        ))}
      </div>
      <ConflictModal
        sentence={conflictSentence}
        sources={conflictSourcesRef.current?.sources ?? []}
        onClose={closeConflict}
      />
    </div>
  );
}

function Legend({ bg, fg, icon, text }: { bg: string; fg: string; icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-stone-200 bg-white/60 px-2 py-1.5">
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${bg} ${fg} text-xs font-bold`}>
        {icon}
      </span>
      <span>{text}</span>
    </div>
  );
}
