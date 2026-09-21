"use client";

import { listConflicts, recordConflict, type StoredConflict } from "./conflicts";
import { dbDelete, dbGetAll, dbPut } from "./db";
import { listDrafts, writeDraft, type LocalDraft } from "./drafts";
import { listQueue, replaceQueue, type QueuedMutation } from "./outbox";
import { collectPendingRefs, replacePendingRefs } from "../studio-media-refs";
import type { PendingMediaKind } from "./media";

/**
 * Where a photograph went, written down before the phone forgets it.
 *
 * ── the window this closes ──
 *
 * The upload loop used to do this, in this order:
 *
 *     const asset = await uploadAsset(item.blob, ...);  // it is on Cloudinary
 *     resolved[item.ref] = asset.public_id;             // ...in a local variable
 *     await discardPendingMedia(item.ref);              // the bytes are gone
 *
 * and only afterwards rewrote the `pending:` placeholders in the queue and the
 * drafts. Killed anywhere in between — which on a phone means "switched apps"
 * — the bytes were deleted, the remote object existed, and the only record of
 * which was which had been in memory.
 *
 * What that leaves is worse than a lost photograph. The save holding that
 * placeholder is deliberately held back by `hasPendingRefs`, so that a
 * reference nobody can resolve never reaches the public site. That entry then
 * waits in the outbox for ever, for an upload that can never happen, because
 * there are no bytes left to upload — and the writing attached to it never
 * goes out again either.
 *
 * ── the rule ──
 *
 * The mapping is durable *before* the bytes are released, and the bytes are
 * released only once it is. Everything after that point is resumable from the
 * mapping, and resuming is idempotent: rewriting a document that has already
 * been rewritten changes nothing.
 *
 * The record is kept until no document anywhere still names the placeholder,
 * which is also how the rewrite is *verified* rather than assumed. A rewrite
 * that storage refused leaves the placeholder in place, the record stays, and
 * the next pass tries again.
 */

export interface MediaResolution {
  /** `pending:<uuid>` — the placeholder documents are still holding. */
  ref: string;
  /** A Cloudinary `public_id`, or a finished https URL for a Loop Clip. */
  resolved: string;
  kind: PendingMediaKind;
  uploadedAt: string;
  /**
   * The provider took the file but the media-library row was not written.
   *
   * Kept because it is true and somebody will want to know: the asset is
   * usable and the reference is correct, it simply will not appear in the
   * library until the bookkeeping is retried. Losing this was how a file could
   * exist remotely and nowhere in the CMS with nothing recording the fact.
   */
  unrecorded?: string;
  /** When the documents were last rewritten from this record. */
  rewrittenAt?: string;
}

export async function rememberResolution(
  resolution: Omit<MediaResolution, "rewrittenAt">
): Promise<boolean> {
  return dbPut("resolutions", resolution);
}

export async function listResolutions(): Promise<MediaResolution[]> {
  const all = await dbGetAll<MediaResolution>("resolutions");
  return all.sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1));
}

/** Everything uploaded whose paperwork is not finished. */
export async function unfinishedResolutions(): Promise<MediaResolution[]> {
  return listResolutions();
}

export async function forgetResolution(ref: string): Promise<void> {
  await dbDelete("resolutions", ref.toLowerCase());
}

/** Keyed the way replacePendingRefs() looks them up: lower case. */
export function resolutionMap(list: MediaResolution[]): Record<string, string> {
  return Object.fromEntries(list.map((item) => [item.ref.toLowerCase(), item.resolved]));
}

/**
 * Test seams for the two stores whose refusal has to be survivable.
 *
 * Only ever passed by tests. A rewrite that storage declines is the case this
 * module exists to handle, and the only honest way to check it is to make a
 * write actually decline.
 */
export interface ResolutionIo {
  writeDraft?: (draft: LocalDraft) => Promise<boolean>;
  writeConflict?: (conflict: StoredConflict) => Promise<void>;
}

/**
 * Rewrites every local document that names one of these placeholders, then
 * forgets the records that are no longer needed.
 *
 * All four stores that can legitimately hold a reference, not just the editor
 * that happens to be open: the queued saves that will reach the server, the
 * recovery drafts that will reopen, and the stored conflicts that still hold a
 * version of the document. Missing one of them leaves a placeholder that will
 * never resolve, in a copy somebody will eventually restore.
 */
export async function applyResolutions(
  resolutions: MediaResolution[],
  io: ResolutionIo = {}
): Promise<void> {
  if (resolutions.length === 0) return;
  const resolved = resolutionMap(resolutions);

  // ── the queue ──
  const queue = await listQueue();
  const rewritten = queue.map((entry) => replacePendingRefs(entry, resolved));
  if (JSON.stringify(queue) !== JSON.stringify(rewritten)) {
    await replaceQueue(rewritten as QueuedMutation[]);
  }

  // ── recovery drafts ──
  const putDraft = io.writeDraft ?? writeDraft;
  for (const draft of await listDrafts()) {
    const next = replacePendingRefs(draft, resolved);
    if (JSON.stringify(next) !== JSON.stringify(draft)) await putDraft(next);
  }

  // ── stored conflicts ──
  const putConflict = io.writeConflict ?? recordConflict;
  for (const conflict of await listConflicts()) {
    const next = replacePendingRefs(conflict, resolved);
    if (JSON.stringify(next) !== JSON.stringify(conflict)) await putConflict(next);
  }

  // ── and only now, the bookkeeping ──
  //
  // Read everything back rather than trusting the writes above. That is what
  // makes this a verification: a store that refused leaves its placeholder in
  // place, the record stays, and the next pass finishes the job.
  const stillHeld = new Set(
    [
      ...collectPendingRefs(await listQueue()),
      ...collectPendingRefs(await listDrafts()),
      ...collectPendingRefs(await listConflicts()),
    ].map((ref) => ref.toLowerCase())
  );

  for (const resolution of resolutions) {
    const ref = resolution.ref.toLowerCase();
    if (stillHeld.has(ref)) {
      await dbPut("resolutions", { ...resolution, rewrittenAt: new Date().toISOString() });
      continue;
    }
    await forgetResolution(ref);
  }
}
