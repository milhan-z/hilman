import assert from "node:assert/strict";
import test from "node:test";
import {
  describeEditor,
  describeRow,
  type EditorSnapshot,
} from "../lib/studio-editor-state";

/**
 * The promises the save bar makes.
 *
 * Every test here is a sentence the studio must never say: that a queued
 * publish is live, that an edited article is a draft, that a failed sync lost
 * the writing. They are cheap to check and expensive to get wrong.
 */

const IPHONE = "this iPhone";

const snapshot = (over: Partial<EditorSnapshot> = {}): EditorSnapshot => ({
  isNew: false,
  published: false,
  dirty: false,
  savedLocally: false,
  inFlight: "none",
  queued: false,
  reachable: true,
  error: null,
  conflict: false,
  ...over,
});

test("a new entry offers both a draft and a publish", () => {
  const status = describeEditor(snapshot({ isNew: true }), IPHONE);
  assert.equal(status.publishLabel, "Draft");
  assert.equal(status.secondary?.id, "save-draft");
  assert.equal(status.primary?.id, "publish");
});

test("editing a live article keeps it Live and calls the edit unsaved", () => {
  const status = describeEditor(snapshot({ published: true, dirty: true }), IPHONE);
  assert.equal(status.state, "PUBLISHED_DIRTY");
  assert.equal(status.statusLine, "Live · Unsaved changes");
  assert.notEqual(status.publishLabel, "Draft");
  assert.match(status.note ?? "", /still shows the published version/);
});

test("a live article with edits offers Update live, not a bare Save", () => {
  const status = describeEditor(snapshot({ published: true, dirty: true }), IPHONE);
  assert.equal(status.primary?.id, "update-live");
  assert.equal(status.secondary?.id, "save-changes");
});

test("saving a live article's edits locally does not make them live", () => {
  const status = describeEditor(
    snapshot({ published: true, dirty: false, savedLocally: true }),
    IPHONE
  );
  assert.equal(status.statusLine, "Live · Saved on this iPhone");
  assert.match(status.note ?? "", /still shows the published version/);
  assert.equal(status.primary?.id, "update-live");
});

test("a queued save offline says it is waiting, never that it is synced", () => {
  const status = describeEditor(snapshot({ queued: true, reachable: false }), IPHONE);
  assert.equal(status.state, "OFFLINE");
  assert.equal(status.localLabel, "Waiting for connection");
  assert.doesNotMatch(status.statusLine, /Synced/);
  assert.match(status.note ?? "", /Saved on this iPhone/);
});

test("a queued save mid-request says it is syncing", () => {
  const status = describeEditor(snapshot({ queued: true, reachable: true, syncing: true }), IPHONE);
  assert.equal(status.state, "QUEUED");
  assert.equal(status.localLabel, "Syncing…");
});

test("a queued save that is merely waiting its turn says where the work is", () => {
  const status = describeEditor(snapshot({ queued: true, reachable: true }), IPHONE);
  assert.equal(status.localLabel, "Saved on this iPhone");
});

test("a publish with no connection is queued, never Live", () => {
  const status = describeEditor(
    snapshot({ queued: true, reachable: false, publishQueued: true }),
    IPHONE
  );
  assert.equal(status.publishLabel, "Draft");
  assert.match(status.note ?? "", /Publish queued/);
  assert.match(status.note ?? "", /reconnects/);
  assert.doesNotMatch(status.statusLine, /Live/);
});

test("publishing with no connection offers to publish when online", () => {
  const status = describeEditor(snapshot({ dirty: true, reachable: false }), IPHONE);
  assert.equal(status.primary?.id, "publish");
  assert.equal(status.primary?.label, "Publish when online");
});

test("a failed sync still says the work is on the device", () => {
  const status = describeEditor(snapshot({ error: "The site is unreachable." }), IPHONE);
  assert.equal(status.state, "ERROR");
  assert.equal(status.localLabel, "Couldn't sync");
  assert.match(status.note ?? "", /Saved on this iPhone/);
  assert.equal(status.primary?.id, "retry");
});

test("a conflict outranks everything else the editor was about to say", () => {
  const status = describeEditor(
    snapshot({ conflict: true, dirty: true, error: "ignored", queued: true }),
    IPHONE
  );
  assert.equal(status.state, "CONFLICT");
  assert.equal(status.localLabel, "Needs review");
  assert.equal(status.primary?.id, "review");
});

test("a settled live article offers nothing to save", () => {
  const status = describeEditor(snapshot({ published: true }), IPHONE);
  assert.equal(status.state, "PUBLISHED_CLEAN");
  assert.equal(status.statusLine, "Live · Synced");
  assert.equal(status.primary, null);
  assert.equal(status.secondary, null);
});

test("no state ever labels unsent work as Live · Synced", () => {
  const unsent: Partial<EditorSnapshot>[] = [
    { published: true, dirty: true },
    { published: true, savedLocally: true },
    { published: true, queued: true },
    { published: true, queued: true, reachable: false },
    { published: true, error: "nope" },
    { published: true, conflict: true },
  ];
  for (const over of unsent) {
    assert.notEqual(describeEditor(snapshot(over), IPHONE).statusLine, "Live · Synced");
  }
});

test("a row with unsent work says so without inventing a status", () => {
  assert.deepEqual(describeRow({ published: true }), {
    publishLabel: "Live",
    localLabel: null,
    tone: "good",
  });
  const pending = describeRow({ published: true, pending: true, reachable: false });
  assert.equal(pending.publishLabel, "Live");
  assert.equal(pending.localLabel, "Waiting for connection");
});
