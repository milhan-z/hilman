"use client";

import { dbDelete, dbGetAll, dbPut, dbReadModifyWrite, dbReplaceAll } from "./db";
import { rebaseQueued, type SyncEntity, type SyncMutation, type SyncPayload } from "../studio-sync-contract";

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
   * Which sender is currently carrying this entry, and since when.
   *
   * `sending` alone was a boolean with nobody's name on it, and
   * releaseStaleSends() ran at startup in every tab and cleared all of them —
   * so opening a second tab while the first was mid-request took the first
   * tab's in-flight work and sent it again. Pass 1's `attemptedAt` stops that
   * corrupting a payload; it does not stop two tabs sending the same thing,
   * and it does not help a tab that dies holding work nobody picks up.
   *
   * A claim answers both: an entry is takeable when nobody holds it, when the
   * holder is us, or when the claim is old enough that its holder is plainly
   * gone. See claimForSending().
   */
  claimedBy?: string;
  claimedAt?: string;
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
 * Clears sending state left behind by a tab that was closed mid-request.
 *
 * Kept as the name the app has always called at startup; the behaviour now
 * lives in releaseExpiredClaims(), which takes back only what belongs to this
 * sender or to a holder whose lease has expired. It makes an entry *sendable*,
 * not *rewritable*: `attemptedAt` is deliberately left in place, because the
 * request may well have reached the server before the tab died.
 */
export async function releaseStaleSends(sender: string, now = Date.now()): Promise<void> {
  await releaseExpiredClaims(sender, now);
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
  // Read, decide and write in one transaction. Doing it as listQueue() then
  // dbPut() left the store open in between, so two saves landing together
  // could both pick the same entry to collapse into and one of them would be
  // overwritten — a save the author had been told was safe, gone.
  const { stored, result } = await dbReadModifyWrite<QueuedMutation, QueuedMutation>(
    "outbox",
    (queue) => {
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

      return { result: mutation, put: [mutation] };
    }
  );

  // The record is still worth returning when storage refused it: the caller
  // falls back to sending it directly, and needs its identity to do that.
  const mutation: QueuedMutation = result ?? {
    mutationId: input.mutationId,
    entity: input.entity,
    entityId: input.entityId,
    localId: input.localId,
    baseUpdatedAt: input.baseUpdatedAt,
    payload: input.payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
  };

  return { mutation, stored };
}

/**
 * How long a sender may hold an entry before another may take it over.
 *
 * Long enough that an ordinary slow upload on a phone is never stolen
 * mid-flight, short enough that a tab closed in a tunnel does not strand its
 * work for the rest of the day. The sync request itself times out well inside
 * this, so in practice a live sender always releases its own claim.
 */
export const SEND_LEASE_MS = 90_000;

const claimIsStale = (entry: QueuedMutation, now: number) =>
  !entry.claimedAt || now - Date.parse(entry.claimedAt) > SEND_LEASE_MS;

/**
 * Takes an entry for sending, if it is ours to take.
 *
 * Returns whether we got it. Claimable when nobody holds it, when we already
 * do — a tab keeps its identity across a reload, so its own interrupted send
 * is available again at once — or when the holder's lease has run out.
 *
 * Read and write happen in one transaction, so two tabs asking at the same
 * moment cannot both be told yes.
 */
export async function claimForSending(
  mutationId: string,
  sender: string,
  now = Date.now()
): Promise<boolean> {
  const { result } = await dbReadModifyWrite<QueuedMutation, boolean>("outbox", (queue) => {
    const entry = queue.find((item) => item.mutationId === mutationId);
    if (!entry) return { result: false };

    const mine = entry.claimedBy === sender;
    const free = !entry.claimedBy || claimIsStale(entry, now);
    if (!mine && !free) return { result: false };

    return {
      result: true,
      put: [
        {
          ...entry,
          sending: true,
          claimedBy: sender,
          claimedAt: new Date(now).toISOString(),
          // Stamped as the request goes out, and never removed. From here on
          // this id means one payload, whatever the network does next.
          ...(entry.attemptedAt ? {} : { attemptedAt: new Date(now).toISOString() }),
        },
      ],
    };
  });
  return result === true;
}

/** Hands an entry back. Only the holder may — a tab does not release another's. */
export async function releaseClaim(mutationId: string, sender: string): Promise<void> {
  await dbReadModifyWrite<QueuedMutation, null>("outbox", (queue) => {
    const entry = queue.find((item) => item.mutationId === mutationId);
    if (!entry || entry.claimedBy !== sender) return { result: null };
    const { claimedBy: _who, claimedAt: _when, ...rest } = entry;
    return { result: null, put: [{ ...rest, sending: false }] };
  });
}

/**
 * At startup: take back what was ours, and anything whose holder is long gone.
 *
 * This replaces releaseStaleSends(), which cleared *every* `sending` flag in
 * the database including another live tab's. Ours come back immediately;
 * somebody else's only once their lease has expired.
 */
export async function releaseExpiredClaims(sender: string, now = Date.now()): Promise<void> {
  await dbReadModifyWrite<QueuedMutation, null>("outbox", (queue) => {
    const put = queue
      .filter((entry) => entry.claimedBy === sender || (entry.claimedBy && claimIsStale(entry, now)) || (entry.sending && !entry.claimedBy))
      .map((entry) => {
        const { claimedBy: _who, claimedAt: _when, ...rest } = entry;
        return { ...rest, sending: false };
      });
    return { result: null, put };
  });
}

/**
 * Removes an applied mutation and moves whatever is still queued for that row
 * onto the version it produced — in one transaction.
 *
 * This was `listQueue()`, then `rebaseQueued()`, then `replaceQueue()`, and
 * `replaceQueue` clears the whole store before writing back the list it read.
 * A save enqueued in that window was written to storage, reported to the
 * author as safe, and then deleted with nothing left to recover it from.
 */
export async function rebaseAfterApplied(
  mutationId: string,
  applied: { localId: string; entity: SyncEntity; id: string; updatedAt: string }
): Promise<void> {
  await dbReadModifyWrite<QueuedMutation, null>("outbox", (queue) => {
    const rest = queue.filter((entry) => entry.mutationId !== mutationId);
    const rebased = rebaseQueued(rest, applied);
    // Only the entries that actually moved are written back; anything that
    // arrived during this transaction is not in `queue` and is not touched.
    const changed = rebased.filter(
      (entry, index) => JSON.stringify(entry) !== JSON.stringify(rest[index])
    );
    return { result: null, put: changed, remove: [mutationId] };
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

/** One entry, changed in place, inside a single transaction. */
async function amend(
  mutationId: string,
  change: (entry: QueuedMutation) => QueuedMutation
): Promise<void> {
  await dbReadModifyWrite<QueuedMutation, null>("outbox", (queue) => {
    const entry = queue.find((item) => item.mutationId === mutationId);
    return entry ? { result: null, put: [change(entry)] } : { result: null };
  });
}

export async function recordAttempt(mutationId: string, error?: string): Promise<void> {
  await amend(mutationId, (entry) => {
    const { claimedBy: _who, claimedAt: _when, ...rest } = entry;
    return {
      ...rest,
      sending: false,
      attempts: entry.attempts + 1,
      ...(error ? { lastError: error } : {}),
    };
  });
}

export async function blockEntry(mutationId: string, reason: string): Promise<void> {
  await amend(mutationId, (entry) => {
    const { claimedBy: _who, claimedAt: _when, ...rest } = entry;
    return {
      ...rest,
      sending: false,
      blocked: true,
      attempts: entry.attempts + 1,
      lastError: reason,
    };
  });
}

/** "I fixed it, try again" — clears the block without touching the payload. */
export async function unblockEntry(mutationId: string): Promise<void> {
  await amend(mutationId, (entry) => {
    const { lastError: _dropped, ...rest } = entry;
    return { ...rest, blocked: false, sending: false };
  });
}

export async function dequeue(mutationId: string): Promise<void> {
  await dbDelete("outbox", mutationId);
}

export async function replaceQueue(queue: QueuedMutation[]): Promise<void> {
  await dbReplaceAll("outbox", queue);
}

/**
 * Who this tab is, for as long as it is this tab.
 *
 * Held in `sessionStorage` on purpose. That is per-tab and survives a reload,
 * which is exactly the identity a send claim wants: a tab that reloads gets
 * its own interrupted work back at once, while a *different* tab has to wait
 * out the lease before it may take it. `localStorage` would make every tab the
 * same sender and claim nothing; a fresh id each load would make a reload
 * queue behind its own lease for a minute and a half.
 *
 * Falls back to a per-realm value when storage is unavailable — private mode,
 * site data blocked — which still distinguishes two tabs within one session.
 */
let cachedSender: string | null = null;

export function senderId(): string {
  if (cachedSender) return cachedSender;

  const fresh = `sender-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  try {
    const existing = sessionStorage.getItem("hilman-studio-sender");
    if (existing) {
      cachedSender = existing;
      return existing;
    }
    sessionStorage.setItem("hilman-studio-sender", fresh);
  } catch {
    /* no session storage — the in-memory value below is still per-realm */
  }
  cachedSender = fresh;
  return fresh;
}
