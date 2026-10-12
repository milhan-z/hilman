import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { dbClearAll, dbGet, dbPut } from "../lib/studio-local/db";
import { writeDraft } from "../lib/studio-local/drafts";
import { releaseIfUnreferenced } from "../lib/studio-local/media-release";

const REF = "pending:11111111-1111-4111-8111-111111111111";
beforeEach(dbClearAll);

test("removing pending media retains bytes needed by a recovery draft", async () => {
  await dbPut("media", { ref: REF, blob: new Blob(["only recording"]) });
  await writeDraft({ key: "journal:new", entity: "journal", entityId: null, localId: "journal:new",
    value: { snapshot: JSON.stringify({ voiceNote: { src: REF } }) }, baseUpdatedAt: null, editedAt: "x" });
  assert.equal(await releaseIfUnreferenced(REF), false);
  assert.ok(await dbGet("media", REF));
});

test("a storage read failure cannot establish that media is unreferenced", async (t) => {
  await dbPut("media", { ref: REF, blob: new Blob(["only recording"]) });
  const originalGetAll = IDBObjectStore.prototype.getAll;
  const failure = t.mock.method(IDBObjectStore.prototype, "getAll", function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["getAll"]>) {
    if (this.name === "outbox") throw new DOMException("Storage unavailable", "UnknownError");
    return originalGetAll.apply(this, args);
  });
  assert.equal(await releaseIfUnreferenced(REF), false);
  failure.mock.restore();
  assert.ok(await dbGet("media", REF));
});
