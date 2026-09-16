"use client";

/**
 * The studio's local database.
 *
 * Draft recovery used to be a JSON string in localStorage. That is fine for a
 * single form and wrong for a phone: localStorage is synchronous (so a large
 * body janks the keystroke that wrote it), it stores strings only (so a photo
 * taken offline has nowhere to go), and it has no notion of a queue. IndexedDB
 * has all three, and is the store browsers evict last.
 *
 * Written by hand rather than with Dexie. The studio depends on seven packages
 * and this needs four verbs; a wrapper that is smaller than its own README is
 * not worth an eighth.
 *
 * Every function here answers "no" rather than throwing when IndexedDB is not
 * available — server rendering, Safari's private mode, a browser with site
 * data blocked. Losing local persistence must degrade the studio to "online
 * only", never break it.
 */

export const DB_NAME = "hilman-studio";
// 2 added `media`, where a photo taken with no signal waits as a Blob.
// The upgrade handler creates whatever stores are missing, so a bump is all an
// existing database needs.
export const DB_VERSION = 2;

export const STORE = {
  drafts: "drafts",
  outbox: "outbox",
  snapshots: "snapshots",
  conflicts: "conflicts",
  media: "media",
} as const;

export type StoreName = (typeof STORE)[keyof typeof STORE];

const KEY_PATHS: Record<StoreName, string> = {
  drafts: "key",
  outbox: "mutationId",
  snapshots: "key",
  conflicts: "key",
  media: "ref",
};

let connecting: Promise<IDBDatabase | null> | null = null;

export function indexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    // Some privacy modes throw on the property access itself.
    return false;
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!indexedDbAvailable()) return Promise.resolve(null);

  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of Object.entries(KEY_PATHS)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      // A second tab upgrading the schema would otherwise block forever.
      db.onversionchange = () => {
        db.close();
        connecting = null;
      };
      resolve(db);
    };

    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export function studioDb(): Promise<IDBDatabase | null> {
  connecting ??= openDatabase().then((db) => {
    if (!db) connecting = null; // let the next call try again
    return db;
  });
  return connecting;
}

/** Runs one transaction and resolves only once it has actually committed. */
async function transact<T>(
  stores: StoreName[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T> | T
): Promise<T | null> {
  const db = await studioDb();
  if (!db) return null;

  return new Promise<T | null>((resolve) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch {
      resolve(null);
      return;
    }

    let result: T | null = null;
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    tx.oncomplete = () => finish(result);
    tx.onerror = () => finish(null);
    tx.onabort = () => finish(null);

    Promise.resolve(run(tx)).then(
      (value) => {
        result = value;
      },
      () => {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        finish(null);
      }
    );
  });
}

const wrap = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/* ── the four verbs ───────────────────────────────────────── */

export async function dbGet<T>(store: StoreName, key: string): Promise<T | null> {
  const value = await transact([store], "readonly", (tx) =>
    wrap<T | undefined>(tx.objectStore(store).get(key) as IDBRequest<T | undefined>)
  );
  return value ?? null;
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const value = await transact([store], "readonly", (tx) =>
    wrap<T[]>(tx.objectStore(store).getAll() as IDBRequest<T[]>)
  );
  return value ?? [];
}

export async function dbPut<T>(store: StoreName, value: T): Promise<boolean> {
  const done = await transact([store], "readwrite", (tx) => wrap(tx.objectStore(store).put(value)));
  return done !== null;
}

export async function dbDelete(store: StoreName, key: string): Promise<boolean> {
  const done = await transact([store], "readwrite", (tx) =>
    wrap(tx.objectStore(store).delete(key))
  );
  return done !== null;
}

/** Replaces a whole store in one transaction — used when rebasing the outbox. */
export async function dbReplaceAll<T>(store: StoreName, values: T[]): Promise<boolean> {
  const done = await transact([store], "readwrite", async (tx) => {
    const objectStore = tx.objectStore(store);
    await wrap(objectStore.clear());
    for (const value of values) await wrap(objectStore.put(value));
    return true;
  });
  return done !== null;
}

/**
 * Everything this browser was holding for the studio.
 *
 * Signing out has to reach this: unpublished drafts and queued saves are the
 * private half of the CMS, and leaving them in a shared phone's browser would
 * undo the point of having a login at all.
 */
export async function dbClearAll(): Promise<void> {
  const stores = Object.values(STORE) as StoreName[];
  await transact(stores, "readwrite", async (tx) => {
    for (const store of stores) await wrap(tx.objectStore(store).clear());
    return true;
  });
}
