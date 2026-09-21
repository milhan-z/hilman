import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll, dbPut } from "../lib/studio-local/db";
import { deleteDraft, listDrafts, readDraft, writeDraft } from "../lib/studio-local/drafts";
import {
  carryRecoveryOver,
  findRecovery,
  keepRecovery,
  forgetRecoveryLookups,
  markRecoveryHandled,
  recoveryWriter,
  surveyLocalWork,
} from "../lib/studio-local/recovery";
import { enqueue } from "../lib/studio-local/outbox";

/**
 * Writing that exists only on this phone must survive being looked at.
 *
 * ── the data loss this file exists to end ──
 *
 * LiveEditor opened with `kept` and `synced` both set to the server document,
 * so on the very first commit `snapshot === synced` was true and the effect
 * that tidies away a stale recovery copy fired immediately — before the effect
 * that *looks* for one had read it. Both hit IndexedDB, the delete transaction
 * was created first, and IndexedDB runs transactions over a store in the order
 * they were created. So the delete won, every time.
 *
 * The consequence: you write a paragraph on a train, the app is killed, you
 * reopen the entry, and the paragraph is gone — destroyed by the act of
 * opening the page that was supposed to offer it back to you.
 *
 * These tests run against a real IndexedDB implementation rather than a stub,
 * because the ordering is the bug. A mock that resolves in call order would
 * have reported this code as correct.
 */

const KEY = "journal:abc";
/** The tab these tests are run by — see senderId() in outbox.ts. */
const TAB = "tab-under-test";
const SERVER = JSON.stringify({ title: "What the site has", blocks: [] });
const LOCAL = JSON.stringify({ title: "What the site has", blocks: ["and a paragraph more"] });

beforeEach(async () => {
  await dbClearAll();
  // The lookup gate is a fact about this device, so it outlives a component.
  // Each test is a fresh device.
  forgetRecoveryLookups();
});

/** A recovery copy left behind by a previous session. */
async function seedRecovery(
  overrides: Partial<Parameters<typeof writeDraft>[0]> = {}
): Promise<void> {
  await writeDraft({
    key: KEY,
    entity: "journal",
    entityId: "abc",
    localId: KEY,
    value: { snapshot: LOCAL, savedAt: "2026-09-20T02:00:00.000Z" },
    baseUpdatedAt: "2026-09-19T00:00:00.000Z",
    editedAt: "2026-09-20T02:00:00.000Z",
    label: "An entry",
    ...overrides,
  });
}

/* ── 1. opening the editor must not destroy what it came to offer ── */

test("a recovery copy survives the editor opening on top of it", async () => {
  await seedRecovery();

  // What the editor does on mount, in the order it does it.
  const found = await findRecovery(KEY, SERVER);

  assert.equal(found.kind, "offer", "the newer local copy is offered, not swallowed");
  assert.equal(await readDraft(KEY) !== null, true, "and it is still on the device");
});

test("the lookup is what decides; nothing may delete before it answers", async () => {
  await seedRecovery();

  // The failure mode was a *concurrent* delete, so race the two deliberately.
  // keepRecovery() is the only cleanup path, and it refuses to run until a
  // lookup for that key has completed.
  const [cleanup, found] = await Promise.all([keepRecovery(KEY, SERVER), findRecovery(KEY, SERVER)]);

  assert.equal(found.kind, "offer");
  assert.equal(cleanup, false, "cleanup declined — this copy is not stale");
  assert.notEqual(await readDraft(KEY), null, "the writing is still here");
});

test("a recovery copy that differs from the server document is offered", async () => {
  await seedRecovery();
  const found = await findRecovery(KEY, SERVER);

  assert.equal(found.kind, "offer");
  if (found.kind !== "offer") return;
  assert.equal(found.snapshot, LOCAL);
  assert.equal(found.savedAt, "2026-09-20T02:00:00.000Z");
});

test("a recovery copy identical to the server document is not offered", async () => {
  await seedRecovery({ value: { snapshot: SERVER, savedAt: "2026-09-20T02:00:00.000Z" } });
  const found = await findRecovery(KEY, SERVER);

  assert.equal(found.kind, "stale", "nothing to restore — it is already on the site");
});

test("a stale copy is cleaned up, but only after the lookup has run", async () => {
  await seedRecovery({ value: { snapshot: SERVER, savedAt: "2026-09-20T02:00:00.000Z" } });

  assert.equal(await keepRecovery(KEY, SERVER), false, "refuses before any lookup");
  assert.notEqual(await readDraft(KEY), null);

  await findRecovery(KEY, SERVER);
  assert.equal(await keepRecovery(KEY, SERVER), true, "now it may go");
  assert.equal(await readDraft(KEY), null);
});

test("cleanup still refuses once the lookup found something worth offering", async () => {
  await seedRecovery();
  await findRecovery(KEY, SERVER);

  assert.equal(await keepRecovery(KEY, SERVER), false);
  assert.notEqual(await readDraft(KEY), null, "an offered copy is never tidied away");
});

/* ── 2. restored writing keeps the version it was written against ── */

test("recovery carries the server version the writing was authored against", async () => {
  // The editor was opened at 09-19 and the paragraph written then. By the time
  // it is reopened the page has been served fresh, so `initial.updated_at` is
  // whatever the row says *now*. Handing the restored writing today's version
  // as its base would tell the server "I saw your latest" when it did not —
  // and a genuine conflict would be applied straight over the top.
  await seedRecovery({ baseUpdatedAt: "2026-09-19T00:00:00.000Z" });

  const found = await findRecovery(KEY, SERVER);
  assert.equal(found.kind, "offer");
  if (found.kind !== "offer") return;

  assert.equal(
    found.baseUpdatedAt,
    "2026-09-19T00:00:00.000Z",
    "the base travels with the writing, not with the page load"
  );
});

/* ── 3. leaving the page before the debounce fires ── */

const pending = () => ({
  key: KEY,
  entity: "journal",
  entityId: "abc",
  localId: KEY,
  value: { snapshot: LOCAL, savedAt: "2026-09-20T02:00:00.000Z" },
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
  editedAt: "2026-09-20T02:00:00.000Z",
});

test("the only local copy of an edit is written down when the editor closes", async () => {
  // Internal navigation unmounts the editor without firing pagehide or
  // visibilitychange, and the 400ms debounce was cleared on unmount. Tapping a
  // link a moment after typing dropped the last thing written.
  const writer = recoveryWriter();
  writer.schedule(pending(), 400);
  assert.equal(await readDraft(KEY), null, "still waiting for the pause in typing");

  const stored = await writer.stop(); // the editor goes away mid-debounce
  assert.equal(stored, true, "leaving flushes instead of cancelling");
  assert.notEqual(await readDraft(KEY), null);
});

test("a writer with nothing pending has nothing to flush", async () => {
  const writer = recoveryWriter();
  assert.equal(await writer.stop(), null);
  assert.equal((await listDrafts()).length, 0);
});

test("the debounce still collapses a burst of typing into one write", async () => {
  const writer = recoveryWriter();
  for (const title of ["a", "ab", "abc"]) {
    writer.schedule({ ...pending(), value: { snapshot: title, savedAt: "x" } }, 5);
  }
  await new Promise((resolve) => setTimeout(resolve, 40));

  const drafts = await listDrafts();
  assert.equal(drafts.length, 1, "one draft, not three");
  assert.equal((drafts[0].value as { snapshot: string }).snapshot, "abc", "and it is the latest");
  await writer.stop();
});

/* ── 4. moving a draft as a create acquires its real id ── */

test("a carried-over draft reaches its new key before the old one is removed", async () => {
  await seedRecovery({ key: "journal:new", localId: "journal:new" });

  const moved = await carryRecoveryOver("journal:new", "journal:abc");

  assert.equal(moved, true);
  assert.notEqual(await readDraft("journal:abc"), null, "the writing is under the real id");
  assert.equal(await readDraft("journal:new"), null, "and the placeholder key is cleared");
});

test("a carry-over that cannot write leaves the source exactly where it was", async () => {
  await seedRecovery({ key: "journal:new", localId: "journal:new" });

  // Storage refuses — a full quota, or site data switched off mid-session.
  const moved = await carryRecoveryOver("journal:new", "journal:abc", {
    write: async () => false,
  });

  assert.equal(moved, false, "it reports the failure rather than swallowing it");
  assert.notEqual(
    await readDraft("journal:new"),
    null,
    "and the only copy is still on the device"
  );
});

test("carrying over nothing is not an error", async () => {
  assert.equal(await carryRecoveryOver("journal:new", "journal:abc"), true);
  assert.equal(await carryRecoveryOver("journal:abc", "journal:abc"), true, "same key is a no-op");
});

/* ── 5. signing out has to see writing that never reached a queue ── */

test("local-only writing is counted before Studio storage is cleared", async () => {
  // A paragraph typed and never saved is in `drafts` and nowhere else: no
  // queued mutation, no conflict, no upload. Sign-out counted only the queue,
  // so the one thing with no other copy was the one thing it could not see.
  await seedRecovery();

  const work = await surveyLocalWork();

  assert.equal(work.drafts, 1, "the recovery copy is inventoried");
  assert.equal(work.total > 0, true, "so sign-out has something to warn about");
  assert.equal(work.queued, 0, "and it is genuinely not in the queue");
});

test("the inventory covers every kind of unsynced work, not just the queue", async () => {
  await seedRecovery();
  await enqueue({
    mutationId: "11111111-1111-4111-8111-111111111111",
    entity: "project",
    entityId: null,
    localId: "project:new-1",
    baseUpdatedAt: null,
    payload: { fields: { title: "Queued" }, blocks: [], tagIds: [] },
  });
  // Seeded straight into the store: stashMedia() optimizes through canvas and
  // WebCodecs, which is a browser's job, and what matters here is only that a
  // photograph still on this device counts as work.
  await dbPut("media", {
    ref: "pending:1",
    kind: "image",
    blob: new Blob(["bytes"]),
    name: "photo.jpg",
    type: "image/jpeg",
    size: 5,
    folder: "hilman",
    capturedAt: "2026-09-20T02:00:00.000Z",
    attempts: 0,
  });

  const work = await surveyLocalWork();

  assert.equal(work.drafts, 1);
  assert.equal(work.queued, 1);
  assert.equal(work.media, 1);
  assert.equal(work.total, 3, "all three are things a sign-out would destroy");
});

test("an empty studio has nothing to warn about", async () => {
  const work = await surveyLocalWork();
  assert.equal(work.total, 0);
});

test("a draft the site already has does not trigger a sign-out warning", async () => {
  // Otherwise every sign-out asks, and a prompt that always appears is a
  // prompt nobody reads.
  await seedRecovery({ value: { snapshot: SERVER, savedAt: "2026-09-20T02:00:00.000Z" } });
  await findRecovery(KEY, SERVER);
  await keepRecovery(KEY, SERVER);

  assert.equal((await surveyLocalWork()).total, 0);
  assert.equal((await listDrafts()).length, 0);
});

/* ── 6. discarding is still the author's decision ── */

test("discarding a recovery copy removes it", async () => {
  await seedRecovery();
  await findRecovery(KEY, SERVER);
  await deleteDraft(KEY);

  assert.equal(await readDraft(KEY), null);
  assert.equal((await surveyLocalWork()).drafts, 0);
});

/* ── 7. after the author has dealt with the offer ─────────── */

test("once an offer is acted on, ordinary cleanup resumes", async () => {
  // Otherwise the key stays permanently un-tidyable for the session: a copy
  // identical to the site's would sit in storage for ever, and sign-out would
  // keep warning about work that is not at risk.
  await seedRecovery();
  const found = await findRecovery(KEY, SERVER);
  assert.equal(found.kind, "offer");

  // The author restores it, edits back to what the site has, and it is saved.
  markRecoveryHandled(KEY);
  await writeDraft({ ...pending(), value: { snapshot: SERVER, savedAt: "later" } });

  assert.equal(await keepRecovery(KEY, SERVER), true);
  assert.equal((await surveyLocalWork()).total, 0, "nothing to warn about");
});

test("acting on an offer never deletes anything by itself", async () => {
  await seedRecovery();
  await findRecovery(KEY, SERVER);

  markRecoveryHandled(KEY);
  assert.notEqual(await readDraft(KEY), null, "handling an offer writes nothing and removes nothing");

  // And a copy belonging to another tab is still off limits afterwards.
  await seedRecovery({ writtenBy: "a-different-tab" });
  assert.equal(await keepRecovery(KEY, SERVER, TAB), false);
  assert.notEqual(await readDraft(KEY), null);
});

/* ── 8. an edit the author undid is not offered back ──────── */

test("an edit typed and undone is not kept as a recovery copy", async () => {
  // Found in the real Studio: change the publication date, press Reset, reopen
  // the entry — and it offers to restore the date you just undid.
  //
  // The editor opens with nothing stored, so the lookup finds nothing. Then
  // typing writes a copy, and undoing brings the document back to exactly what
  // the site has. What is on the device is now an intermediate the author has
  // moved away from.
  assert.equal((await findRecovery(KEY, SERVER)).kind, "none");
  await seedRecovery({
    value: { snapshot: "a half-finished thought", savedAt: "earlier" },
    writtenBy: TAB,
  });

  const removed = await keepRecovery(KEY, SERVER, TAB);

  assert.equal(removed, true, "our own intermediate goes");
  assert.equal(await readDraft(KEY), null, "so reopening offers nothing to restore");
});

test("another tab's unsaved writing is never tidied away", async () => {
  // The same rule must not reach across tabs: a second editor open on this
  // document may be holding writing that exists nowhere else.
  assert.equal((await findRecovery(KEY, SERVER)).kind, "none");
  await seedRecovery({
    value: { snapshot: "what the other tab is in the middle of", savedAt: "now" },
    writtenBy: "a-different-tab",
  });

  assert.equal(await keepRecovery(KEY, SERVER, TAB), false, "not ours to delete");
  assert.notEqual(await readDraft(KEY), null);
});

test("a copy identical to the site is tidied whoever wrote it", async () => {
  // Nothing is lost by removing it, so ownership does not need to be proved.
  await seedRecovery({ value: { snapshot: SERVER, savedAt: "x" }, writtenBy: "a-different-tab" });
  await findRecovery(KEY, SERVER);


  assert.equal(await keepRecovery(KEY, SERVER, TAB), true);
  assert.equal(await readDraft(KEY), null);
});

test("a pending write is dropped when the document returns to the synced state", async () => {
  const writer = recoveryWriter();
  writer.schedule({ ...pending(), value: { snapshot: "typed then undone", savedAt: "x" } }, 400);

  const dropped = await writer.discard();

  assert.equal(dropped, true, "there was something waiting, and it is not written");
  assert.equal(await readDraft(KEY), null, "nothing reached the device");
});

test("discarding with nothing pending is not an error", async () => {
  assert.equal(await recoveryWriter().discard(), false);
});
