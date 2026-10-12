"use client";

import { listConflicts } from "./conflicts";
import { dbDelete, dbGetAll, dbPut, dbReadModifyWriteStores } from "./db";
import { listDrafts } from "./drafts";
import { listQueue } from "./outbox";
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
 * Completed mappings stay on this device: another tab or a delayed recovery
 * write may still hold the old placeholder in memory. They are small identity
 * records, not media bytes, and make a late save resolvable too. Only mappings
 * with unfinished work participate in the next flush.
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
  const [resolutions, queue, drafts, conflicts] = await Promise.all([
    listResolutions(), listQueue(), listDrafts(), listConflicts(),
  ]);
  const held = new Set(collectPendingRefs([queue, drafts, conflicts]));
  return resolutions.filter((item) => !item.rewrittenAt || held.has(item.ref.toLowerCase()));
}

export async function forgetResolution(ref: string): Promise<void> {
  await dbDelete("resolutions", ref.toLowerCase());
}

/** Keyed the way replacePendingRefs() looks them up: lower case. */
export function resolutionMap(list: MediaResolution[]): Record<string, string> {
  return Object.fromEntries(list.map((item) => [item.ref.toLowerCase(), item.resolved]));
}

/**
 * Rewrites references and records completion in one transaction. Reading a
 * draft and later putting the rewritten copy used to overwrite an autosave
 * made in between. An unreadable store must also never look like evidence
 * that a mapping is no longer needed.
 *
 * All four stores that can legitimately hold a reference, not just the editor
 * that happens to be open: the queued saves that will reach the server, the
 * recovery drafts that will reopen, and the stored conflicts that still hold a
 * version of the document. Missing one of them leaves a placeholder that will
 * never resolve, in a copy somebody will eventually restore.
 */
export async function applyResolutions(
  resolutions: MediaResolution[]
): Promise<void> {
  if (resolutions.length === 0) return;
  const resolved = resolutionMap(resolutions);

  await dbReadModifyWriteStores(["outbox", "drafts", "conflicts", "resolutions"], (all) => {
    const put: Partial<Record<"outbox" | "drafts" | "conflicts" | "resolutions", unknown[]>> = {};
    for (const store of ["outbox", "drafts", "conflicts"] as const) {
      put[store] = (all[store] ?? [])
        .map((before) => ({ before, after: replacePendingRefs(before, resolved) }))
        .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
        .map(({ after }) => after);
    }
    put.resolutions = (all.resolutions as MediaResolution[])
      .filter((item) => resolved[item.ref.toLowerCase()] === item.resolved)
      .map((item) => ({ ...item, rewrittenAt: new Date().toISOString() }));
    return { result: true, put };
  });
}
