"use client";

import { dbDelete, dbGet, dbGetAll, dbPut, indexedDbAvailable } from "./db";

/**
 * Work in progress that has not reached the database.
 *
 * The rule the studio already had and keeps: a draft found here is *offered*,
 * never applied. Restoring is the editor's decision, and a restored draft still
 * has to be saved. Moving the store from localStorage to IndexedDB changes
 * where the bytes live, not who decides.
 */

export interface LocalDraft<T = unknown> {
  /** `${entity}:${localId}` — stable across the create that gives it a real id. */
  key: string;
  entity: string;
  entityId: string | null;
  localId: string;
  value: T;
  /** The server version this draft was started from, when there was one. */
  baseUpdatedAt: string | null;
  editedAt: string;
  /** A human-readable name for the resume list on the dashboard. */
  label?: string;
  /**
   * Which tab last wrote this copy — see senderId() in outbox.ts.
   *
   * Only cleanup reads it. A tab may tidy away its *own* stale copy once the
   * document is back to what the site has; another tab's copy is never touched,
   * because that tab may be in the middle of writing something.
   */
  writtenBy?: string;
}

export const draftKey = (entity: string, localId: string) => `${entity}:${localId}`;

export async function readDraft<T>(key: string): Promise<LocalDraft<T> | null> {
  return dbGet<LocalDraft<T>>("drafts", key);
}

/** Returns false when this browser stores nothing — see enqueue()'s `stored`. */
export async function writeDraft<T>(draft: LocalDraft<T>): Promise<boolean> {
  return dbPut("drafts", draft);
}

export async function deleteDraft(key: string): Promise<void> {
  await dbDelete("drafts", key);
}

export async function listDrafts(): Promise<LocalDraft[]> {
  const drafts = await dbGetAll<LocalDraft>("drafts");
  return drafts.sort((a, b) => (a.editedAt < b.editedAt ? 1 : -1));
}

/* ── moving in from localStorage ──────────────────────────── */

const LEGACY_PREFIX = "hilman-draft:";
const MIGRATED_FLAG = "hilman-draft-migrated";

/**
 * Carries drafts written by the previous version across, once.
 *
 * Someone can have unsaved work in this browser from before the change. Losing
 * it to an upgrade would be the exact failure the draft system exists to
 * prevent, so the old keys are copied over and only then removed.
 */
export async function migrateLegacyDrafts(): Promise<number> {
  if (typeof window === "undefined" || !indexedDbAvailable()) return 0;

  let storage: Storage;
  try {
    storage = window.localStorage;
    if (storage.getItem(MIGRATED_FLAG) === "1") return 0;
  } catch {
    return 0;
  }

  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(LEGACY_PREFIX)) keys.push(key);
    }
  } catch {
    return 0;
  }

  let moved = 0;
  for (const storageKey of keys) {
    try {
      const raw = storage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { savedAt?: string };
      const name = storageKey.slice(LEGACY_PREFIX.length);

      // The old keys were already "<entity>:<id>" for the editors and a bare
      // name for the dashboard widget. Both survive as-is.
      const [entity, ...rest] = name.split(":");
      await writeDraft({
        key: name,
        entity: rest.length ? entity : "widget",
        entityId: rest.length && rest[0] !== "new" ? rest.join(":") : null,
        localId: rest.length ? rest.join(":") : name,
        value: parsed,
        baseUpdatedAt: null,
        editedAt: parsed.savedAt ?? new Date().toISOString(),
        label: titleWithin(parsed),
      });
      storage.removeItem(storageKey);
      moved += 1;
    } catch {
      /* one unreadable draft must not stop the rest moving */
    }
  }

  try {
    storage.setItem(MIGRATED_FLAG, "1");
  } catch {
    /* nothing to do — the flag is an optimisation, not a correctness guard */
  }
  return moved;
}

/**
 * Digs the title out of an old draft so the resume list can name it.
 *
 * The two previous formats both buried it: the editors stored a JSON string
 * under `snapshot`, the dashboard widget an object under `value`. A recovered
 * draft called "Untitled" is one you have to open to identify, which rather
 * defeats a list whose whole job is to say what you were in the middle of.
 */
function titleWithin(draft: unknown): string | undefined {
  if (!draft || typeof draft !== "object") return undefined;

  const { snapshot, value } = draft as { snapshot?: unknown; value?: unknown };

  if (typeof snapshot === "string") {
    try {
      const parsed = JSON.parse(snapshot) as { title?: unknown };
      const title = String(parsed?.title ?? "").trim();
      if (title) return title;
    } catch {
      /* fall through */
    }
  }

  if (value && typeof value === "object") {
    const title = String((value as { title?: unknown }).title ?? "").trim();
    if (title) return title;
  }

  return undefined;
}
