"use client";

import { dbDelete, dbGetAll, dbPut, dbReplaceAll } from "./db";
import type { SyncEntity, SyncMutation, SyncPayload } from "../studio-sync-contract";

/**
 * Saves that are waiting for a network.
 *
 * One entry per queued save, keyed by its mutation id so a retry can never
 * become a second write. The queue is deliberately small: for any one row it
 * keeps the *latest* version rather than a history, because the save functions
 * replace a document wholesale — an older queued copy of the same project has
 * nothing in it the newer copy lacks.
 *
 * The exception is an entry that has ever been *attempted*. That one is frozen
 * for good, because its id is now a promise made to the server.
 *
 * ── why "attempted", and not "sending" ──
 *
 * This used to skip entries with `sending` set, which sounds like the same
 * rule and is not. Consider:
 *
 *   1. A is queued as mutation M and sent.
 *   2. The server applies M/A and records M in its idempotency ledger.
 *   3. The response is lost. `sending` goes back to false.
 *   4. The author writes B and saves.
 *   5. M is no longer "sending", so B is written into it, keeping the id M.
 *   6. M/B is sent. The ledger recognises M, correctly reports that it has
 *      already been applied, and returns A's result without reading B.
 *   7. The client dequeues M and the editor says everything is saved.
 *
 * B is gone from the queue, was never on the server, and is reported as safe.
 * The ledger did precisely its job; what broke the contract was one id being
 * given two meanings.
 *
 * So the gate is `attemptedAt`, which is set when the request goes out and is
 * never cleared. `attempts` cannot serve: it counts *answers*, and a tab
 * closed mid-request never gets one — a reload would clear `sending`, leave
 * `attempts` at zero, and re-open the whole hole.
 */

export interface QueuedMutation extends SyncMutation {
  /** Set while a request carrying this entry is in flight. */
  sending?: boolean;
  /**
   * When this entry first left the device. Never cleared.
   *
   * Once it exists the payload is frozen: the server may already have applied
   * it, and an id whose meaning can change is an id that can acknowledge the
   * wrong writing.
   */
  attemptedAt?: string;
  /**
   * The server refused this one for a reason that will not change on its own —
   * a missing title, a publish that fails the quality gate, a lost session. It
   * stays in the queue so the work is still here, but it is not retried until
   * someone acts on it.
   */
  blocked?: boolean;
}

export async function listQueue(): Promise<QueuedMutation[]> {
  const queue = await dbGetAll<QueuedMutation>("outbox");
  return queue.sort((a, b) => (a.queuedAt < b.queuedAt ? -1 : 1));
}

/**
 * Clears `sending` flags left behind by a tab that was closed mid-request.
 *
 * Without this they are permanent and the entry is never sent again. It makes
 * the entry *sendable*, not *rewritable*: `attemptedAt` is deliberately left
 * in place, because the request may well have reached the server before the
 * tab died. Safe to run at startup — nothing is in flight before the app has
 * started.
 */
export async function releaseStaleSends(): Promise<void> {
  const queue = await listQueue();
  const stuck = queue.filter((entry) => entry.sending);
  for (const entry of stuck) await dbPut("outbox", { ...entry, sending: false });
}

export async function queueSize(): Promise<number> {
  return (await listQueue()).length;
}

export interface EnqueueInput {
  mutationId: string;
  entity: SyncEntity;
  entityId: string | null;
  localId: string;
  baseUpdatedAt: string | null;
  payload: SyncPayload;
}

export interface EnqueueResult {
  mutation: QueuedMutation;
  /**
   * Whether the entry actually reached this device's storage.
   *
   * False in Safari's private mode and anywhere site data is blocked. The
   * caller has to know: "Saved on this iPhone" is the studio's central
   * promise, and a queue write that quietly evaporated would make it a lie at
   * exactly the moment it matters.
   */
  stored: boolean;
}

/**
 * Whether this entry may still be rewritten.
 *
 * Only an entry that has never left the device. A blocked one has been to the
 * server and come back refused, and its payload is the thing the author is
 * being asked to look at.
 */
const neverAttempted = (entry: QueuedMutation) =>
  !entry.sending && !entry.attemptedAt && !entry.blocked && entry.attempts === 0;

/**
 * Adds a save to the queue, collapsing it with an earlier *unsent* save of the
 * same row.
 *
 * The collapsed entry keeps the *original* baseUpdatedAt. That matters: the
 * base records which server version the editor started from, and typing more
 * does not make the edit any fresher with respect to a change someone else
 * made in the meantime.
 *
 * An attempted entry is never collapsed into — see the file comment. The cost
 * is that one row can have two saves waiting, which runFlush() handles by
 * sending one of them at a time; the benefit is that no mutation id ever
 * means two different things.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const queue = await listQueue();
  const previous = queue.find(
    (entry) =>
      neverAttempted(entry) &&
      entry.entity === input.entity &&
      (entry.localId === input.localId ||
        (entry.entityId != null && entry.entityId === input.entityId))
  );

  const mutation: QueuedMutation = {
    mutationId: previous?.mutationId ?? input.mutationId,
    entity: input.entity,
    entityId: input.entityId ?? previous?.entityId ?? null,
    localId: previous?.localId ?? input.localId,
    baseUpdatedAt: previous ? previous.baseUpdatedAt : input.baseUpdatedAt,
    payload: input.payload,
    queuedAt: previous?.queuedAt ?? new Date().toISOString(),
    attempts: previous?.attempts ?? 0,
  };

  const stored = await dbPut("outbox", mutation);
  return { mutation, stored };
}

export async function markSending(mutationId: string, sending: boolean): Promise<void> {
  const queue = await listQueue();
  const entry = queue.find((item) => item.mutationId === mutationId);
  if (!entry) return;
  await dbPut("outbox", {
    ...entry,
    sending,
    // Stamped as the request goes out, and never removed. From here on this
    // id means one payload, whatever the network does next.
    ...(sending && !entry.attemptedAt ? { attemptedAt: new Date().toISOString() } : {}),
  });
}

/**
 * At most one save per row, oldest first.
 *
 * Now that a second edit made during a lost round trip becomes its own
 * mutation, two saves of the same document can be waiting together. They must
 * not travel in one request: the server applies them in order, and the second
 * one's `baseUpdatedAt` still names the version from before the first landed,
 * so it would come back as a conflict between the author and themselves.
 *
 * Sending one and rebasing the rest onto its result — which applyOutcome()
 * already does — turns that into an ordinary sequence of edits.
 */
export function oneSavePerRow(queue: QueuedMutation[]): QueuedMutation[] {
  const seen = new Set<string>();
  const batch: QueuedMutation[] = [];
  for (const entry of queue) {
    const row = `${entry.entity}:${entry.entityId ?? entry.localId}`;
    if (seen.has(row)) continue;
    seen.add(row);
    batch.push(entry);
  }
  return batch;
}

export async function recordAttempt(mutationId: string, error?: string): Promise<void> {
  const queue = await listQueue();
  const entry = queue.find((item) => item.mutationId === mutationId);
  if (!entry) return;
  await dbPut("outbox", {
    ...entry,
    sending: false,
    attempts: entry.attempts + 1,
    ...(error ? { lastError: error } : {}),
  });
}

export async function blockEntry(mutationId: string, reason: string): Promise<void> {
  const queue = await listQueue();
  const entry = queue.find((item) => item.mutationId === mutationId);
  if (!entry) return;
  await dbPut("outbox", {
    ...entry,
    sending: false,
    blocked: true,
    attempts: entry.attempts + 1,
    lastError: reason,
  });
}

/** "I fixed it, try again" — clears the block without touching the payload. */
export async function unblockEntry(mutationId: string): Promise<void> {
  const queue = await listQueue();
  const entry = queue.find((item) => item.mutationId === mutationId);
  if (!entry) return;
  const { lastError: _dropped, ...rest } = entry;
  await dbPut("outbox", { ...rest, blocked: false, sending: false });
}

export async function dequeue(mutationId: string): Promise<void> {
  await dbDelete("outbox", mutationId);
}

export async function replaceQueue(queue: QueuedMutation[]): Promise<void> {
  await dbReplaceAll("outbox", queue);
}
