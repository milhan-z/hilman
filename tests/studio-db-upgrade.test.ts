import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";

import { DB_NAME, DB_VERSION, dbGetAll, dbPut, studioDb } from "../lib/studio-local/db";

/**
 * The database on a phone that already has one.
 *
 * Adding the `resolutions` store meant bumping DB_VERSION, and a version bump
 * is a migration whether or not it is written as one. The studio's whole
 * promise is that writing survives on the device, so the upgrade running over
 * a database with drafts and a queue in it is exactly the moment that promise
 * is either kept or quietly broken.
 *
 * The `onupgradeneeded` handler creates whatever stores are missing and
 * touches nothing else, which is the behaviour this pins.
 */

/** A version-2 database, as an existing installation would have left it. */
function seedOldDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [name, keyPath] of [
        ["drafts", "key"],
        ["outbox", "mutationId"],
        ["snapshots", "key"],
        ["conflicts", "key"],
        ["media", "ref"],
      ] as const) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["drafts", "outbox"], "readwrite");
      tx.objectStore("drafts").put({
        key: "journal:abc",
        entity: "journal",
        entityId: "abc",
        localId: "journal:abc",
        value: { snapshot: "writing that only exists here", savedAt: "2026-09-21T00:00:00.000Z" },
        baseUpdatedAt: null,
        editedAt: "2026-09-21T00:00:00.000Z",
      });
      tx.objectStore("outbox").put({
        mutationId: "11111111-1111-4111-8111-111111111111",
        entity: "journal",
        entityId: "abc",
        localId: "journal:abc",
        baseUpdatedAt: null,
        payload: { fields: { title: "A queued save" }, blocks: [], tagIds: [] },
        queuedAt: "2026-09-21T00:00:00.000Z",
        attempts: 0,
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

test("upgrading to the new version keeps every draft and queued save", async () => {
  await seedOldDatabase();

  // Opening through the app's own path performs the upgrade.
  const db = await studioDb();
  assert.ok(db, "the database opened");
  assert.equal(db!.version, DB_VERSION);

  const drafts = await dbGetAll<{ value: { snapshot: string } }>("drafts");
  assert.equal(drafts.length, 1, "the unsaved writing survived the upgrade");
  assert.equal(drafts[0].value.snapshot, "writing that only exists here");

  const queue = await dbGetAll<{ mutationId: string }>("outbox");
  assert.equal(queue.length, 1, "and so did the queued save");
  assert.equal(queue[0].mutationId, "11111111-1111-4111-8111-111111111111");
});

test("the store the new version needs is there afterwards", async () => {
  const db = await studioDb();
  assert.equal(db!.objectStoreNames.contains("resolutions"), true);

  // And it works, rather than merely existing.
  assert.equal(
    await dbPut("resolutions", {
      ref: "pending:11111111-1111-4111-8111-111111111111",
      resolved: "hilman/photo",
      kind: "image",
      uploadedAt: "2026-09-21T00:00:00.000Z",
    }),
    true
  );
  assert.equal((await dbGetAll("resolutions")).length, 1);
});
