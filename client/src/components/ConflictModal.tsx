import * as Dialog from '@radix-ui/react-dialog';
import type { Source } from '@lumen/shared';
import type { ClientSentence } from '../store';

type Props = {
  sentence: ClientSentence | null;
  sources: Source[];
  onClose: () => void;
};

export function ConflictModal({ sentence, sources, onClose }: Props) {
  const verdict = sentence?.verdict ?? null;
  const open = !!sentence && verdict?.status === 'contradicted';
  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const supporting = verdict?.supportingSourceId ? sourceById.get(verdict.supportingSourceId) : undefined;
  const conflicting = verdict?.conflictingSourceId ? sourceById.get(verdict.conflictingSourceId) : undefined;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-stone-900/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(900px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-xl outline-none">
          <Dialog.Title className="text-lg font-semibold text-stone-900">
            Sources disagree on this claim
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-stone-600">
            {sentence?.text}
          </Dialog.Description>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-md border-2 border-emerald-300 bg-emerald-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                Supporting
              </div>
              <div className="mt-1 text-sm font-medium text-stone-900">
                {supporting?.title ?? 'unknown source'}
              </div>
              <blockquote className="mt-3 text-sm italic text-stone-700">
                "{verdict?.supportingQuote ?? ''}"
              </blockquote>
              {supporting && (
                <a
                  href={supporting.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-emerald-700 hover:underline"
                >
                  open source ↗
                </a>
              )}
            </div>
            <div className="rounded-md border-2 border-rose-400 bg-rose-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-rose-800">
                Conflicting
              </div>
              <div className="mt-1 text-sm font-medium text-stone-900">
                {conflicting?.title ?? 'unknown source'}
              </div>
              <blockquote className="mt-3 text-sm italic text-stone-700">
                "{verdict?.conflictingQuote ?? ''}"
              </blockquote>
              {conflicting && (
                <a
                  href={conflicting.url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-xs text-rose-700 hover:underline"
                >
                  open source ↗
                </a>
              )}
            </div>
          </div>

          {verdict?.rationale && (
            <p className="mt-4 text-sm text-stone-600">
              <span className="font-medium text-stone-700">Verifier note:</span> {verdict.rationale}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Dialog.Close className="rounded-md bg-stone-900 px-3 py-1.5 text-sm text-white hover:bg-stone-700">
              Close
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
