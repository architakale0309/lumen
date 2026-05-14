import { Chat } from './components/Chat';
import { Composer } from './components/Composer';

export default function App() {
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-sm bg-emerald-500" />
            <h1 className="text-sm font-semibold tracking-tight text-stone-900">
              Lumen
            </h1>
          </div>
          <div className="text-[11px] uppercase tracking-wider text-stone-400">
            sentence-level grounding · live
          </div>
        </div>
      </header>
      <Chat />
      <Composer />
    </div>
  );
}
