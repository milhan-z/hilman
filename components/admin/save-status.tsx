"use client";

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
 * Save status that describes what is on screen right now — not the last time
 * a request succeeded. "Saved" disappears the moment something changes again.
 */
export function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return <span className="text-sm text-soft">Saving…</span>;
  }
  if (state.kind === "dirty") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-soft">
        <span aria-hidden className="h-2 w-2 rounded-full bg-hl" />
        Unsaved changes
      </span>
    );
  }
  // "Kept" rather than "Saved": the work is on this phone, and the site has
  // not seen it yet. Calling that Saved is the lie this whole component exists
  // to avoid.
  if (state.kind === "queued") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-soft">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-hl" />
        Kept on this phone — waiting to send
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span role="alert" className="text-sm font-medium text-red">
        Not saved — {state.message}
      </span>
    );
  }
  return (
    <span className="text-sm text-soft">
      {state.savedAt ? `Saved ${relative(state.savedAt)}` : "No changes"}
    </span>
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
  if (!recovery) return null;
  return (
    <div className="rounded-md border border-hl bg-hl-soft/25 p-4">
      <p className="text-sm font-semibold text-ink">
        There's an unsaved draft in this browser from {relative(recovery.savedAt)}.
      </p>
      <p className="mt-1 text-sm text-soft">
        It was never saved to the site. Restoring it only fills the form back in — you still
        decide whether to save.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="rounded bg-hl px-3.5 py-2 text-sm font-semibold text-hl-ink"
        >
          Restore draft
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded border border-line px-3.5 py-2 text-sm"
        >
          Discard it
        </button>
      </div>
    </div>
  );
}
