"use client";

import type { SyncEntity, SyncPayload } from "../studio-sync-contract";
import { enqueue, listQueue } from "./outbox";
import { flushOutbox, sendDirect, subscribeSyncEvents } from "./sync";

/**
 * The one way the studio saves content.
 *
 * Online and offline are the same code path on purpose. Every save is written
 * to the local queue first and only then sent; there is no branch that decides
 * "the network looks fine, skip the queue", because that branch is exactly
 * where a save goes missing when the connection dies mid-request.
 *
 * What changes with connectivity is only how quickly this function can tell
 * you what happened.
 */

export interface SaveRequest {
  entity: SyncEntity;
  /** Null for something being created. */
  entityId: string | null;
  /** Stable across a create, so the draft can follow the row it becomes. */
  localId: string;
  /** The row's updated_at as this editor last saw it. */
  baseUpdatedAt: string | null;
  payload: SyncPayload;
}

export type SaveResult =
  | { status: "saved"; id: string; updatedAt: string }
  /** Written down here; it will send itself. */
  | { status: "queued" }
  | { status: "conflict"; id: string }
  /** The server refused it, and will refuse it again unchanged. */
  | { status: "rejected"; message: string };

export async function saveThroughQueue(request: SaveRequest): Promise<SaveResult> {
  const mutationId = newMutationId();

  const { mutation: queued, stored } = await enqueue({
    mutationId,
    entity: request.entity,
    entityId: request.entityId,
    localId: request.localId,
    baseUpdatedAt: request.baseUpdatedAt,
    payload: request.payload,
  });

  // No storage on this device — see sendDirect(). Nothing is in the queue to
  // flush, so the save has to go out by itself or not at all.
  if (!stored) return resultFromDirect(queued);

  // Collect what the flush says about *this* row while it runs, so the answer
  // does not depend on inspecting a queue that has already moved on.
  const heard: {
    applied?: { id: string; updatedAt: string };
    conflicted?: { id: string };
  } = {};

  const unsubscribe = subscribeSyncEvents((event) => {
    if (event.type === "applied" && event.save.localId === queued.localId) {
      heard.applied = { id: event.save.id, updatedAt: event.save.updatedAt };
    }
    if (event.type === "conflict" && event.localId === queued.localId) {
      heard.conflicted = { id: event.id };
    }
  });

  try {
    await flushOutbox();
  } finally {
    unsubscribe();
  }

  if (heard.applied) return { status: "saved", ...heard.applied };
  if (heard.conflicted) return { status: "conflict", ...heard.conflicted };

  // Still in the queue: either there was no network, or a concurrent flush was
  // already in flight and this entry goes out with the next one.
  const entry = (await listQueue()).find((item) => item.mutationId === queued.mutationId);
  if (entry?.blocked) {
    return { status: "rejected", message: entry.lastError ?? "The studio server refused this save." };
  }
  return { status: "queued" };
}

/** What a save that has been written down but not yet answered looks like. */
export type HandoffResult =
  /** Safely on this device. The sending is happening in the background. */
  | { status: "stored"; mutationId: string; localId: string }
  /** This browser stores nothing, so the save went straight out and landed. */
  | { status: "saved"; id: string; updatedAt: string }
  | { status: "conflict"; id: string }
  | { status: "rejected"; message: string };

/**
 * Hands a save to the queue and returns as soon as it is safe, not as soon as
 * it is public.
 *
 * This is the difference between an editor that feels instant and one that
 * doesn't. `saveThroughQueue` waits for the flush so it can report what the
 * server said; on a good connection that is a few hundred milliseconds of a
 * dead button, and on a bad one it is much worse. The writing was already safe
 * after the first await here — an IndexedDB put — so that is where the UI gets
 * its answer, and the server's verdict arrives later as a sync event the
 * editor is already listening for.
 */
export async function handOffSave(request: SaveRequest): Promise<HandoffResult> {
  const { mutation: queued, stored } = await enqueue({
    mutationId: newMutationId(),
    entity: request.entity,
    entityId: request.entityId,
    localId: request.localId,
    baseUpdatedAt: request.baseUpdatedAt,
    payload: request.payload,
  });

  if (!stored) return resultFromDirect(queued);

  // Not awaited: the point of this function is that the caller doesn't.
  void flushOutbox();
  return { status: "stored", mutationId: queued.mutationId, localId: queued.localId };
}

async function resultFromDirect(
  mutation: Parameters<typeof sendDirect>[0]
): Promise<Exclude<HandoffResult, { status: "stored" }>> {
  const outcome = await sendDirect(mutation);

  if (!outcome) {
    return {
      status: "rejected",
      message:
        "This browser isn't letting Studio keep a copy, and the site couldn't be reached. " +
        "Nothing was saved — keep this screen open until you have a connection.",
    };
  }
  if (outcome.status === "saved") {
    return { status: "saved", id: outcome.id, updatedAt: outcome.updatedAt };
  }
  if (outcome.status === "conflict") return { status: "conflict", id: outcome.id };
  return { status: "rejected", message: outcome.message };
}

/**
 * crypto.randomUUID() needs a secure context. Deployed and on localhost it is
 * always there; over plain http on a phone on the local network it is not, and
 * a save that throws because of how the page was served is not acceptable.
 */
function newMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export { newMutationId };
