"use client";

import { collectPendingRefs } from "../studio-media-refs";
import { listConflicts } from "./conflicts";
import { discardPendingMedia } from "./media";
import { listQueue } from "./outbox";

/**
 * Lets go of a stashed file the author no longer wants — unless something
 * that will still be sent names it.
 *
 * Removing or replacing a recording that has not uploaded yet used to delete
 * its bytes on the spot. If a save naming it was already queued (written
 * offline, say, then Publish pressed), that save could then never go: the
 * outbox holds back anything naming a placeholder until it resolves, and a
 * placeholder with no bytes never resolves.
 *
 * So the bytes go only when no queued save and no stored conflict names
 * them. Otherwise they stay, upload as usual, and the queued save goes out
 * resolved; a newer save made afterwards replaces it on the site. The file
 * left behind is an orphan in storage — the documented cost, preferred to a
 * save that can never be sent.
 *
 * Returns whether the bytes were released.
 */
export async function releaseIfUnreferenced(ref: string): Promise<boolean> {
  const wanted = ref.toLowerCase();
  const [queue, conflicts] = await Promise.all([listQueue(), listConflicts()]);
  const named = new Set(collectPendingRefs([queue.map((entry) => entry.payload), conflicts]));
  if (named.has(wanted)) return false;
  await discardPendingMedia(ref);
  return true;
}
