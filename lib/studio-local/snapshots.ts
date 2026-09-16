"use client";

import { dbGet, dbGetAll, dbPut } from "./db";
import type { SyncEntity } from "../studio-sync-contract";

/**
 * What the server last said about a row.
 *
 * Two jobs. The offline screen uses them to show something truthful — "here is
 * what you were working on" — instead of an empty page. And a save carries the
 * snapshot's `updatedAt` as its base, which is what lets the server notice that
 * the row moved on while this phone was in a tunnel.
 *
 * These are summaries, not copies. Full offline reading of every project is a
 * separate feature with its own storage budget; this is the list.
 */

export interface ServerSnapshot {
  /** `${entity}:${id}` */
  key: string;
  entity: SyncEntity;
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  fetchedAt: string;
}

export const snapshotKey = (entity: SyncEntity, id: string) => `${entity}:${id}`;

export async function readSnapshot(entity: SyncEntity, id: string): Promise<ServerSnapshot | null> {
  return dbGet<ServerSnapshot>("snapshots", snapshotKey(entity, id));
}

export async function writeSnapshot(
  snapshot: Omit<ServerSnapshot, "key" | "fetchedAt">
): Promise<void> {
  await dbPut("snapshots", {
    ...snapshot,
    key: snapshotKey(snapshot.entity, snapshot.id),
    fetchedAt: new Date().toISOString(),
  });
}

export async function listSnapshots(): Promise<ServerSnapshot[]> {
  const snapshots = await dbGetAll<ServerSnapshot>("snapshots");
  return snapshots.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/** Records the new version after our own save, so the next edit has a base. */
export async function touchSnapshot(
  entity: SyncEntity,
  id: string,
  updatedAt: string,
  fallback?: { title?: string; status?: string }
): Promise<void> {
  const existing = await readSnapshot(entity, id);
  await writeSnapshot({
    entity,
    id,
    updatedAt,
    title: fallback?.title ?? existing?.title ?? "Untitled",
    status: fallback?.status ?? existing?.status ?? "draft",
  });
}
