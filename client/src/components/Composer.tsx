import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useStore } from '../store';

const SUGGESTIONS = [
  "What did Apple announce at WWDC 2025?",
  "Is intermittent fasting effective for weight loss?",
  "What's the latest on the James Webb telescope?",
  "Has SpaceX's Starship reached orbit yet?",
];

export function Composer() {
  const [text, setText] = useState('');
  const sendMessage = useStore((s) => s.sendMessage);
  const isSending = useStore((s) => s.isSending);
  const empty = useStore((s) => s.messages.length === 0);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || isSending) return;
    void sendMessage(text);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6">
      {empty && (
        <div className="mb-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void sendMessage(s)}
              disabled={isSending}
              className="group rounded-full border border-stone-200 bg-white/80 px-3 py-1.5 text-xs text-stone-600 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:bg-white hover:text-stone-900 hover:shadow disabled:translate-y-0 disabled:opacity-50"
            >
              <span className="mr-1.5 text-emerald-500 opacity-0 transition group-hover:opacity-100">›</span>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white/90 px-3 py-2 shadow-md backdrop-blur transition focus-within:border-emerald-400 focus-within:shadow-lg focus-within:ring-2 focus-within:ring-emerald-100"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask anything — answers are fact-checked sentence by sentence."
          rows={1}
          className="max-h-48 min-h-[2rem] flex-1 resize-none bg-transparent px-1 py-1 text-sm text-stone-900 outline-none placeholder:text-stone-400"
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !text.trim()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-stone-700 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {isSending ? (
            <>
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
              sending…
            </>
          ) : (
            <>
              send
              <span aria-hidden>↵</span>
            </>
          )}
        </button>
      </form>
      <p className="mt-2 text-center text-[10px] text-stone-400">
        Enter to send · Shift+Enter for newline
      </p>
    </div>
  );
}
