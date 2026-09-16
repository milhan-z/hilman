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
 * The exception is an entry that has already been sent once. That one is left
 * alone: until its answer arrives, replacing it would mean giving the same
 * edit a second mutation id, which is exactly how a double write happens.
 */

export interface QueuedMutation extends SyncMutation {
  /** Set while a request carrying this entry is in flight. */
  sending?: boolean;
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
 * Without this they are permanent: a stuck flag means the entry is never
 * collapsed with a newer edit of the same row, so every save after it adds
 * another queue entry instead of replacing one. Safe to run at startup —
 * nothing is in flight before the app has started.
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
 * Adds a save to the queue, collapsing it with an earlier unsent save of the
 * same row.
 *
 * The collapsed entry keeps the *original* baseUpdatedAt. That matters: the
 * base records which server version the editor started from, and typing more
 * does not make the edit any fresher with respect to a change someone else
 * made in the meantime.
 */
export async function enqueue(input: EnqueueInput): Promise<EnqueueResult> {
  const queue = await listQueue();
  const previous = queue.find(
    (entry) =>
      !entry.sending &&
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
  await dbPut("outbox", { ...entry, sending });
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
