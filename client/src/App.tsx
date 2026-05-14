import { Chat } from './components/Chat';
import { Composer } from './components/Composer';

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <h1 className="text-sm font-semibold tracking-tight text-stone-900">
              Lumen
            </h1>
            <span className="hidden text-xs text-stone-400 sm:inline">
              · sentence-level grounding
            </span>
          </div>
          <a
            href="https://github.com/architakale0309/lumen"
            target="_blank"
            rel="noreferrer"
            className="text-[11px] uppercase tracking-wider text-stone-400 hover:text-stone-600"
          >
            source ↗
          </a>
        </div>
      </header>
      <Chat />
      <Composer />
    </div>
  );
}
