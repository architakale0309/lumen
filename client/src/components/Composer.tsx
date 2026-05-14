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
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 hover:border-stone-400 hover:text-stone-900 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={submit}
        className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white px-3 py-2 shadow-sm focus-within:border-stone-500"
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
          className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {isSending ? 'sending…' : 'send'}
        </button>
      </form>
    </div>
  );
}
