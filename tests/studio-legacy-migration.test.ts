import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { dbClearAll } from "../lib/studio-local/db";
import { listDrafts, migrateLegacyDrafts, writeDraft } from "../lib/studio-local/drafts";

beforeEach(dbClearAll);

test("a synchronous IndexedDB quota refusal is reported as an unstored draft", async (t) => {
  t.mock.method(IDBObjectStore.prototype, "put", () => {
    throw new DOMException("Quota exceeded", "QuotaExceededError");
  });
  assert.equal(await writeDraft({ key: "journal:new", entity: "journal", entityId: null,
    localId: "journal:new", value: { title: "Still on screen" }, baseUpdatedAt: null, editedAt: "x" }), false);
});

test("legacy recovery remains at its source after quota refusal and migrates on retry", async (t) => {
  const key = "hilman-draft:journal:new";
  const raw = JSON.stringify({ snapshot: JSON.stringify({ title: "My only copy" }) });
  const values = new Map([[key, raw]]);
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => { values.set(name, value); },
    removeItem: (name: string) => { values.delete(name); },
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });

  const originalPut = IDBObjectStore.prototype.put;
  const refusal = t.mock.method(IDBObjectStore.prototype, "put", function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore["put"]>) {
    const request = originalPut.apply(this, args);
    if (this.name === "drafts") request.addEventListener("success", () => this.transaction.abort(), { once: true });
    return request;
  });
  assert.equal(await migrateLegacyDrafts(), 0);
  assert.equal(values.get(key), raw, "source is retained until the destination commits");
  assert.equal(values.has("hilman-draft-migrated"), false, "a future startup must try again");
  assert.equal((await listDrafts()).length, 0);

  refusal.mock.restore();
  assert.equal(await migrateLegacyDrafts(), 1);
  assert.equal(values.has(key), false);
  assert.equal(values.get("hilman-draft-migrated"), "1");
  assert.equal((await listDrafts())[0].label, "My only copy");
});
