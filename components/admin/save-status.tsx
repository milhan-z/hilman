"use client";

import { StatusLine, useDeviceName } from "./mobile/status-line";
import type { SaveState, DraftRecovery } from "./use-editor-draft";

function relative(iso?: string) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const seconds = Math.round((Date.now() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return then.toLocaleString();
}

/**
 * Save status for the screens that are one form rather than a document —
 * Pages and Settings.
 *
 * The editors use describeEditor() in lib/studio-editor-state.ts, which has a
 * publish state to reason about as well. These forms have no such thing: a
 * page is either saved or it isn't. What they share with the editors is the
 * vocabulary, so the same words mean the same things everywhere.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  const device = useDeviceName();

  if (state.kind === "saving") return <StatusLine tone="pending">Saving…</StatusLine>;
  if (state.kind === "dirty") return <StatusLine tone="warn">Unsaved changes</StatusLine>;

  // "Saved on this iPhone" rather than "Saved": the work is here and the site
  // has not seen it. Collapsing those two is the confusion this whole file
  // exists to avoid.
  if (state.kind === "queued") {
    return <StatusLine tone="pending">Saved on {device} — waiting to send</StatusLine>;
  }
  if (state.kind === "error") {
    return <StatusLine tone="bad">Couldn&apos;t save — {state.message}</StatusLine>;
  }
  return (
    <StatusLine tone={state.savedAt ? "good" : "neutral"}>
      {state.savedAt ? `Synced ${relative(state.savedAt)}` : "No changes"}
    </StatusLine>
  );
}

/**
 * A draft found in this browser that never reached the database. Offered, not
 * applied: recovering is a decision, and it still has to be saved afterwards.
 */
export function DraftRecoveryNotice<T>({
  recovery,
  onAccept,
  onDiscard,
}: {
  recovery: DraftRecovery<T> | null;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const device = useDeviceName();
  if (!recovery) return null;

  return (
    <div className="rounded-md border border-hl bg-hl-soft/25 p-4">
      <p className="text-sm font-semibold text-ink">
        There are unsaved changes on {device} from {relative(recovery.savedAt)}.
      </p>
      <p className="mt-1 text-sm text-soft">
        They never reached the site. Restoring only fills the form back in — you still decide
        whether to save.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-12 rounded-md border border-line bg-surface px-4 text-sm font-semibold text-soft"
        >
          Discard them
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="min-h-12 rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink"
        >
          Restore them
        </button>
      </div>
    </div>
  );
}
