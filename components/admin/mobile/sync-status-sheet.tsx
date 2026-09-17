"use client";

import { MobileSheet } from "../mobile-sheet";
import { useSyncState } from "../studio-runtime";
import { useDeviceName } from "./status-line";
import type { EditorStatus } from "@/lib/studio-editor-state";
import { cn } from "@/lib/utils";

/**
 * Where this document actually is, in three lines.
 *
 * The studio already has a sync panel — <SyncDrawer /> — but it is the whole
 * queue: what is waiting, what the server refused, which rows have two
 * versions, with an action on each. That is the right screen for "something is
 * wrong" and the wrong one for "is this saved?", which is the question the
 * status line in the editor header is actually asking.
 *
 * So tapping it opens this instead: the same three questions the editor's
 * status model already answers, laid out as a checklist you can read in a
 * second. Anything genuinely needing attention hands over to the full panel.
 */

type StepState = "done" | "pending" | "no";

function Step({ state, label, detail }: { state: StepState; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-2xs font-bold",
          state === "done" && "bg-pen text-hl-ink",
          state === "pending" && "border-2 border-hl bg-transparent text-hl",
          state === "no" && "border-2 border-line-strong bg-transparent text-faint"
        )}
      >
        {state === "done" ? "✓" : state === "pending" ? "…" : ""}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">{label}</span>
        {detail && <span className="mt-0.5 block text-xs text-faint">{detail}</span>}
      </span>
    </li>
  );
}

const relative = (iso: string | null) => {
  if (!iso) return null;
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "recently";
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

export function SyncStatusSheet({
  open,
  onClose,
  status,
  published,
}: {
  open: boolean;
  onClose: () => void;
  status: EditorStatus;
  /** What the public site currently serves. */
  published: boolean;
}) {
  const sync = useSyncState();
  const device = useDeviceName();

  const unsaved = status.state === "DRAFT_DIRTY" || status.state === "PUBLISHED_DIRTY" || status.state === "NEW_DRAFT";
  const onDevice = !unsaved;
  const withServer = onDevice && !status.localLabel.startsWith("Saved on") && !sync.queued;
  const needsAttention = status.state === "CONFLICT" || status.state === "ERROR";

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title="Sync status"
      actions={
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 w-full rounded-md bg-hl text-sm font-semibold text-hl-ink"
        >
          Done
        </button>
      }
    >
      <div className="space-y-5">
        <ul className="space-y-3">
          <Step
            state={onDevice ? "done" : "pending"}
            label={`Saved on ${device}`}
            detail={onDevice ? undefined : "Still only on screen — save to keep it."}
          />
          <Step
            state={withServer ? "done" : onDevice ? "pending" : "no"}
            label="Synced to Studio"
            detail={
              withServer
                ? relative(sync.lastSyncedAt)
                  ? `Last synced ${relative(sync.lastSyncedAt)}`
                  : "Nothing waiting to send."
                : sync.reachable
                  ? "On its way."
                  : "Waiting for a connection."
            }
          />
          <Step
            // The one that matters. A working copy of a live article is
            // deliberately not on the site, and saying so is the point.
            state={published && withServer && !status.note ? "done" : "no"}
            label={published ? "Public site is up to date" : "Not on the public site"}
            detail={
              published
                ? status.note ?? undefined
                : "This is a draft. Publish when you are ready."
            }
          />
        </ul>

        {needsAttention && (
          <button
            type="button"
            onClick={() => {
              onClose();
              window.dispatchEvent(new Event("hilman:sync"));
            }}
            className="min-h-12 w-full rounded-md border border-red/50 bg-red-soft/20 text-sm font-semibold text-red"
          >
            Something needs your decision — open sync
          </button>
        )}
      </div>
    </MobileSheet>
  );
}
