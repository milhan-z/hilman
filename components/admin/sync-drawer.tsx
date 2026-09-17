"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MobileSheet } from "./mobile-sheet";
import { connectivityFrom } from "./connectivity-pill";
import { flushOutbox, refreshSyncState, useSyncState } from "./studio-runtime";
import { uploadNoun } from "@/lib/studio-local/sync";
import { listQueue, dequeue, unblockEntry, type QueuedMutation } from "@/lib/studio-local/outbox";
import { listConflicts, resolveConflict, type StoredConflict } from "@/lib/studio-local/conflicts";
import { enqueue } from "@/lib/studio-local/outbox";
import { newMutationId } from "@/lib/studio-local/save";
import {
  discardPendingMedia,
  listPendingMedia,
  retryPendingMedia,
  storageReport,
  type PendingMedia,
} from "@/lib/studio-local/media";
import { PendingClip, PendingPhoto } from "./pending-media";
import { cn } from "@/lib/utils";

/**
 * Everything the studio is holding on your behalf, in one place.
 *
 * The queue is only trustworthy if it is inspectable. So this lists what is
 * waiting, what the server refused and why, and which rows have two versions —
 * and every one of those has an action attached. Nothing here resolves itself
 * quietly in the background.
 */

const relative = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 45) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

const editorHref = (entity: "project" | "journal", id: string | null) =>
  `/admin/${entity === "project" ? "projects" : "journal"}/${id ?? "new"}`;

const titleOf = (mutation: QueuedMutation) =>
  String(mutation.payload.fields.title ?? "").trim() || "Untitled";

export function SyncDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useSyncState();
  const router = useRouter();
  const [queue, setQueue] = useState<QueuedMutation[]>([]);
  const [conflicts, setConflicts] = useState<StoredConflict[]>([]);
  const [photos, setPhotos] = useState<PendingMedia[]>([]);
  const [space, setSpace] = useState<{ usage: number; quota: number } | null>(null);
  const summary = connectivityFrom(state);
  const mediaNoun = uploadNoun(photos);
  /** Work actually addressed to the site: saves queued, plus photos going up. */
  const waiting = state.queued + state.media;

  const reload = useCallback(async () => {
    const [nextQueue, nextConflicts, nextPhotos, report] = await Promise.all([
      listQueue(),
      listConflicts(),
      listPendingMedia(),
      storageReport(),
    ]);
    setQueue(nextQueue);
    setConflicts(nextConflicts);
    setPhotos(nextPhotos);
    setSpace(report && report.quota > 0 ? { usage: report.usage, quota: report.quota } : null);
    await refreshSyncState();
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload, state.queued, state.blocked, state.conflicts, state.media]);

  async function discard(mutationId: string) {
    await dequeue(mutationId);
    await reload();
  }

  async function dropPhoto(ref: string) {
    await discardPendingMedia(ref);
    await reload();
  }

  async function retryPhoto(ref: string) {
    await retryPendingMedia(ref);
    await reload();
    await flushOutbox();
  }

  async function retry(mutationId: string) {
    await unblockEntry(mutationId);
    await reload();
    await flushOutbox();
  }

  /** Keep the server's version: drop ours and reload the editor's data. */
  async function keepServer(conflict: StoredConflict) {
    await resolveConflict(conflict.key);
    await reload();
    router.refresh();
  }

  /**
   * Keep ours: re-queue the same payload, now based on the version we were
   * shown. That is an explicit overwrite of something we have just read, which
   * is the only kind of overwrite this studio performs.
   */
  async function keepMine(conflict: StoredConflict) {
    await enqueue({
      mutationId: newMutationId(),
      entity: conflict.entity,
      entityId: conflict.id,
      localId: `${conflict.entity}:${conflict.id}`,
      baseUpdatedAt: conflict.server.updatedAt,
      payload: conflict.mine,
    });
    await resolveConflict(conflict.key);
    await reload();
    await flushOutbox();
  }

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title="Sync"
      subtitle={summary.label}
      actions={
        /* Two different buttons, not one button with two labels.
           There is something to send: a highlighted Send now. There is not:
           a plain Done that closes the panel. The old version was a single
           `bg-hl` button reading "Nothing to send" — warning-yellow, disabled,
           and unpressable — which is emphasis spent on the one state that is
           entirely fine. Yellow is for something needing attention. */
        waiting > 0 || state.syncing ? (
          <button
            type="button"
            onClick={() => void flushOutbox()}
            disabled={state.syncing}
            className="min-h-12 w-full rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {state.syncing ? "Syncing…" : `Send ${waiting === 1 ? "it" : "them"} now`}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-soft transition-colors hover:text-ink"
          >
            Done
          </button>
        )
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-soft">{summary.detail}</p>

        {/* The information the old yellow button was carrying, in the place
            information belongs. Stated plainly, and only when it is true. */}
        {waiting === 0 && state.conflicts === 0 && state.blocked === 0 && (
          <p className="rounded-md border border-line bg-raise p-3 text-sm text-soft">
            Nothing waiting to send.
          </p>
        )}

        {state.lastSyncedAt && (
          <p className="font-mono text-2xs uppercase tracking-wide text-faint">
            Last synced {relative(state.lastSyncedAt)}
          </p>
        )}

        {conflicts.length > 0 && (
          <section aria-labelledby="sync-conflicts">
            <h3 id="sync-conflicts" className="mb-2 text-sm font-semibold text-ink">
              Two versions
            </h3>
            <ul className="space-y-3">
              {conflicts.map((conflict) => (
                <li key={conflict.key} className="rounded-md border border-red bg-red-soft p-3.5">
                  <p className="text-sm font-semibold text-ink">
                    {String(conflict.server.fields.title ?? "Untitled")}
                  </p>
                  <p className="mt-1 text-sm text-soft">
                    This {conflict.entity} changed somewhere else while your version was waiting.{" "}
                    {conflict.differences.length > 0
                      ? `You disagree about ${conflict.differences.join(", ")}.`
                      : "The two versions are hard to tell apart."}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void keepServer(conflict)}
                      className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-semibold text-soft transition-colors hover:text-ink"
                    >
                      Keep theirs
                    </button>
                    <button
                      type="button"
                      onClick={() => void keepMine(conflict)}
                      className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink"
                    >
                      Keep mine
                    </button>
                  </div>
                  <Link
                    href={editorHref(conflict.entity, conflict.id)}
                    onClick={onClose}
                    className="mt-2 flex min-h-11 items-center text-sm text-pen underline-offset-4 hover:underline"
                  >
                    Open the editor and decide there →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {photos.length > 0 && (
          <section aria-labelledby="sync-photos">
            {/* The heading names whatever is actually here — a queue holding
                only loop clips should not be headed "Photos". */}
            <h3 id="sync-photos" className="mb-2 text-sm font-semibold text-ink">
              {mediaNoun === "photo" ? "Photos" : mediaNoun === "clip" ? "Clips" : "Files"} on this
              phone
            </h3>
            <p className="mb-2.5 text-sm text-soft">
              A save that uses one of these waits for it, so the site is never asked to show
              something that has not been uploaded.
            </p>
            <ul className="space-y-3">
              {photos.map((photo) => (
                <li key={photo.ref}>
                  {/* A clip in this list used to be drawn by <PendingPhoto />,
                      which renders an <img>: the author saw a broken thumbnail
                      for a file that was uploading perfectly well. */}
                  {photo.kind === "loop-clip" ? (
                    <PendingClip clipRef={photo.ref} onDiscard={() => void dropPhoto(photo.ref)} />
                  ) : (
                    <PendingPhoto photoRef={photo.ref} onDiscard={() => void dropPhoto(photo.ref)} />
                  )}
                  {photo.blocked && (
                    <button
                      type="button"
                      onClick={() => void retryPhoto(photo.ref)}
                      className="mt-2 inline-flex min-h-11 items-center rounded-md bg-hl px-3.5 text-sm font-semibold text-hl-ink"
                    >
                      Try this upload again
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {space && (
              <p className="mt-2.5 font-mono text-2xs uppercase tracking-wide text-faint">
                {megabytes(space.usage)} of {megabytes(space.quota)} used on this device
              </p>
            )}
          </section>
        )}

        <section aria-labelledby="sync-queue">
          <h3 id="sync-queue" className="mb-2 text-sm font-semibold text-ink">
            Waiting to send
          </h3>
          {queue.length === 0 ? (
            <p className="rounded-md border border-line bg-raise px-3.5 py-4 text-sm text-soft">
              Nothing is queued. Everything you&apos;ve saved has reached the site.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {queue.map((mutation) => (
                <li
                  key={mutation.mutationId}
                  className={cn(
                    "rounded-md border p-3.5",
                    mutation.blocked ? "border-red bg-red-soft" : "border-line bg-raise"
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">
                      {titleOf(mutation)}
                    </p>
                    <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-faint">
                      {mutation.entity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-faint">
                    Queued {relative(mutation.queuedAt)}
                    {mutation.attempts > 0 &&
                      ` · ${mutation.attempts} ${mutation.attempts === 1 ? "try" : "tries"}`}
                  </p>

                  {mutation.blocked && mutation.lastError && (
                    <p role="alert" className="mt-2 text-sm font-medium text-red">
                      {mutation.lastError}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={editorHref(mutation.entity, mutation.entityId)}
                      onClick={onClose}
                      className="inline-flex min-h-11 items-center rounded-md border border-line-strong px-3.5 text-sm font-medium text-soft transition-colors hover:text-ink"
                    >
                      Open
                    </Link>
                    {mutation.blocked && (
                      <button
                        type="button"
                        onClick={() => void retry(mutation.mutationId)}
                        className="inline-flex min-h-11 items-center rounded-md bg-hl px-3.5 text-sm font-semibold text-hl-ink"
                      >
                        Try again
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void discard(mutation.mutationId)}
                      className="inline-flex min-h-11 items-center rounded-md px-3.5 text-sm font-medium text-red transition-colors hover:bg-red-soft"
                    >
                      Discard
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MobileSheet>
  );
}
