"use client";

import { dbDelete, dbGetAll, dbPut } from "./db";
import type { ServerDocument, SyncEntity, SyncPayload } from "../studio-sync-contract";

/**
 * Two versions of the same thing, both real.
 *
 * A conflict is not an error to dismiss — it is one of them containing writing
 * that nobody else has. So it is stored, survives a reload, and stays in the
 * way until the editor says which version wins. Nothing is merged
 * automatically and nothing is thrown away on the studio's own initiative.
 */

export interface StoredConflict {
  /** `${entity}:${id}` — one open conflict per row at a time. */
  key: string;
  entity: SyncEntity;
  id: string;
  /** The version composed on this device. */
  mine: SyncPayload;
  /** The version that was already on the server. */
  server: ServerDocument;
  /** Field names that actually differ, from describeConflict(). */
  differences: string[];
  noticedAt: string;
}

export const conflictKey = (entity: SyncEntity, id: string) => `${entity}:${id}`;

export async function recordConflict(conflict: StoredConflict): Promise<void> {
  await dbPut("conflicts", conflict);
}

export async function listConflicts(): Promise<StoredConflict[]> {
  const conflicts = await dbGetAll<StoredConflict>("conflicts");
  return conflicts.sort((a, b) => (a.noticedAt < b.noticedAt ? 1 : -1));
}

export async function resolveConflict(key: string): Promise<void> {
  await dbDelete("conflicts", key);
}
