import * as Popover from '@radix-ui/react-popover';
import type { Source, Verdict } from '@lumen/shared';
import type { ClientSentence } from '../store';

type Props = {
  sentence: ClientSentence;
  sources: Source[];
  onOpenConflict: (sentence: ClientSentence) => void;
};

const STATUS_STYLES: Record<NonNullable<Verdict['status']>, string> = {
  supported: 'bg-emerald-50 border-b-2 border-emerald-400',
  partial: 'bg-amber-50 border-b-2 border-amber-400',
  unsupported: 'bg-rose-50 border-b-2 border-rose-300',
  contradicted: 'bg-rose-100 border-b-2 border-rose-500',
};

const STATUS_BADGES: Record<NonNullable<Verdict['status']>, string> = {
  supported: '✓',
  partial: '~',
  unsupported: '✗',
  contradicted: '⚡',
};

export function Sentence({ sentence, sources, onOpenConflict }: Props) {
  const verdict = sentence.verdict;
  const sourceById = new Map(sources.map((s) => [s.id, s]));

  if (!verdict) {
    return (
      <span className="shimmer-underline">
        {sentence.text + ' '}
      </span>
    );
  }

  const baseClass = `${STATUS_STYLES[verdict.status]} px-0.5 rounded-sm cursor-help`;
  const supportingSource = verdict.supportingSourceId
    ? sourceById.get(verdict.supportingSourceId)
    : undefined;
  const conflictingSource = verdict.conflictingSourceId
    ? sourceById.get(verdict.conflictingSourceId)
    : undefined;

  const handleClick = () => {
    if (verdict.status === 'contradicted') onOpenConflict(sentence);
  };

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <span
            className={baseClass}
            onClick={handleClick}
            role={verdict.status === 'contradicted' ? 'button' : undefined}
          >
            <span className="text-[10px] font-bold mr-0.5 text-stone-500 select-none">
              {STATUS_BADGES[verdict.status]}
            </span>
            {sentence.text}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            sideOffset={6}
            className="z-50 max-w-md rounded-md border border-stone-200 bg-white p-3 text-sm shadow-lg outline-none"
          >
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
              {labelFor(verdict.status)}
            </div>
            <p className="mb-2 text-stone-700">{verdict.rationale || '(no rationale)'}</p>
            {verdict.supportingQuote && supportingSource && (
              <div className="mb-2 rounded border-l-2 border-emerald-400 bg-emerald-50 px-2 py-1">
                <div className="text-[11px] text-emerald-900 font-medium mb-0.5">
                  supports: {supportingSource.title}
                </div>
                <blockquote className="text-stone-700 italic">"{verdict.supportingQuote}"</blockquote>
                <a
                  href={supportingSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-emerald-700 hover:underline"
                >
                  open source ↗
                </a>
              </div>
            )}
            {verdict.conflictingQuote && conflictingSource && (
              <div className="rounded border-l-2 border-rose-500 bg-rose-50 px-2 py-1">
                <div className="text-[11px] text-rose-900 font-medium mb-0.5">
                  conflicts: {conflictingSource.title}
                </div>
                <blockquote className="text-stone-700 italic">"{verdict.conflictingQuote}"</blockquote>
                <a
                  href={conflictingSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-rose-700 hover:underline"
                >
                  open source ↗
                </a>
              </div>
            )}
            {verdict.status === 'contradicted' && (
              <button
                type="button"
                onClick={handleClick}
                className="mt-2 w-full rounded bg-stone-900 px-2 py-1 text-xs font-medium text-white hover:bg-stone-700"
              >
                open side-by-side comparison
              </button>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {' '}
    </>
  );
}

function labelFor(status: Verdict['status']): string {
  switch (status) {
    case 'supported':
      return 'verified';
    case 'partial':
      return 'partially supported';
    case 'unsupported':
      return 'not supported by sources';
    case 'contradicted':
      return 'sources disagree';
  }
}
