"use client";

import type { StoredConflict } from "./conflicts";
import { dbMove } from "./db";
import type { QueuedMutation } from "./outbox";

/**
 * Moving writing from one local store to another without dropping it.
 *
 * The studio does this exactly twice, and both were written the same unsafe
 * way — two independent steps, with the source removed first:
 *
 *     await dequeue(mutationId);        // the only copy, gone
 *     await recordConflict({ ... });    // ...and if this does not happen?
 *
 * IndexedDB does not throw when it refuses. Every verb in db.ts returns rather
 * than raising, which is the right shape for a studio that has to stay usable
 * when storage is full or switched off — and it means a failed second step was
 * completely silent. No error, no conflict, no queue entry: a save the author
 * had been told was safe simply stopped existing.
 *
 * Both moves are now one transaction over both stores. The source cannot go
 * unless the destination arrived, because neither happens unless both do.
 * That is the whole of this module, and it is deliberately two named functions
 * rather than one generic one: there are two transitions in this product, they
 * mean different things, and each deserves to say what it is.
 */

/**
 * A save the server refused as a conflict, becoming a conflict to resolve.
 *
 * Leaves the queue and enters the conflicts store together. If the conflict
 * cannot be written — a full quota, site data switched off — the save stays
 * queued and this returns false, so the flush can report that rather than
 * quietly having lost it.
 */
export async function moveQueuedToConflict(
  mutationId: string,
  conflict: StoredConflict
): Promise<boolean> {
  return dbMove({ store: "outbox", key: mutationId }, { store: "conflicts", value: conflict });
}

/**
 * "Keep mine": a conflict the author resolved, becoming a save to send.
 *
 * The ordering here was already right — enqueue, then drop the conflict — but
 * the answer was discarded, so a refused enqueue still removed the conflict
 * that held the same writing. One transaction settles it either way.
 *
 * The queued save is a *new* record rather than a collapse into whatever else
 * is waiting for that row. If the author kept writing after the refusal, that
 * newer save is already queued, and folding this older payload into it would
 * quietly undo everything typed since.
 */
export async function moveConflictToQueue(
  conflictKey: string,
  mutation: QueuedMutation
): Promise<boolean> {
  return dbMove({ store: "conflicts", key: conflictKey }, { store: "outbox", value: mutation });
}
