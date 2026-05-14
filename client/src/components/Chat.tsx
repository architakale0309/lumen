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
          <div className="rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
            <h1 className="text-2xl font-semibold text-stone-900">Lumen</h1>
            <p className="mt-2 text-sm text-stone-600">
              Ask a question. The agent searches the web and a second model fact-checks every sentence
              against the retrieved sources — live.
            </p>
            <ul className="mt-4 inline-block text-left text-xs text-stone-500">
              <li>
                <span className="mr-2 inline-block rounded bg-emerald-100 px-1.5 text-emerald-800">✓</span>
                supported by sources
              </li>
              <li>
                <span className="mr-2 inline-block rounded bg-amber-100 px-1.5 text-amber-800">~</span>
                partially supported
              </li>
              <li>
                <span className="mr-2 inline-block rounded bg-rose-100 px-1.5 text-rose-800">✗</span>
                no source support found
              </li>
              <li>
                <span className="mr-2 inline-block rounded bg-rose-200 px-1.5 text-rose-900">⚡</span>
                sources disagree — click to compare
              </li>
            </ul>
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
