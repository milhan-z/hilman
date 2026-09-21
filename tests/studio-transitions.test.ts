import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll, dbGetAll } from "../lib/studio-local/db";
import { listConflicts, type StoredConflict } from "../lib/studio-local/conflicts";
import { enqueue, listQueue, newQueuedMutation } from "../lib/studio-local/outbox";
import {
  moveConflictToQueue,
  moveQueuedToConflict,
} from "../lib/studio-local/transitions";

/**
 * Moving writing from one local store to another without dropping it.
 *
 * ── the losses this file exists to end ──
 *
 * The studio moves a save between two IndexedDB stores twice. A save the
 * server refused as a conflict leaves the outbox and becomes a stored
 * conflict; a conflict the author resolves with "Keep mine" leaves the
 * conflicts store and becomes a queued save. Both were written as two
 * independent steps, and the first one deleted the source:
 *
 *     await dequeue(mutationId);        // the only copy, gone
 *     await recordConflict({ ... });    // ...and if this does not happen?
 *
 * IndexedDB does not throw when it refuses — every verb in db.ts returns
 * rather than raising, which is the right shape for a studio that must stay
 * usable when storage is full or switched off. So a failed second step was
 * silent, and the writing was simply not there any more. No error, no
 * conflict, no queue entry, nothing to recover from.
 *
 * "Keep mine" had the ordering right and the checking wrong: it enqueued
 * first, then removed the conflict — but ignored `stored`, so a refused
 * enqueue still deleted the conflict holding the same writing.
 *
 * Both are now single transactions. The source cannot go unless the
 * destination arrived, because neither happens unless both do.
 *
 * ── how the failure is injected ──
 *
 * No production seam and no test-only branch: the tests plant a value
 * IndexedDB genuinely cannot store — structured clone refuses a function — so
 * the real transaction really aborts. What is exercised is the code that ships.
 */

const ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const M = "11111111-1111-4111-8111-111111111111";
const N = "22222222-2222-4222-8222-222222222222";

const mine = { fields: { title: "What I wrote on the train" }, blocks: [], tagIds: [] };

const queued = {
  mutationId: M,
  entity: "journal" as const,
  entityId: ROW,
  localId: `journal:${ROW}`,
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
  payload: mine,
};

const conflict = (extra: Partial<StoredConflict> = {}): StoredConflict => ({
  key: `journal:${ROW}`,
  entity: "journal",
  id: ROW,
  mine,
  server: {
    id: ROW,
    updatedAt: "2026-09-20T00:00:00.000Z",
    fields: { title: "What the site has" },
    blocks: [],
    tagIds: [],
  },
  differences: ["title"],
  noticedAt: "2026-09-21T00:00:00.000Z",
  ...extra,
});

/** A record IndexedDB cannot store: structured clone refuses a function. */
const unstorable = <T>(record: T): T =>
  ({ ...record, poison: () => "structured clone refuses this" }) as T;

beforeEach(async () => {
  await dbClearAll();
});

/* ══ 1. a refused save becoming a stored conflict ══════════ */

test("the queued save survives when the conflict cannot be written", async () => {
  await enqueue(queued);

  const moved = await moveQueuedToConflict(M, unstorable(conflict()));

  assert.equal(moved, false, "it reports the failure rather than swallowing it");
  const queue = await listQueue();
  assert.equal(queue.length, 1, "the writing is still in the queue");
  assert.equal(queue[0].mutationId, M);
  assert.deepEqual(queue[0].payload, mine, "and it is the same writing");
});

test("a successful move leaves exactly one durable copy", async () => {
  await enqueue(queued);

  assert.equal(await moveQueuedToConflict(M, conflict()), true);

  assert.equal((await listQueue()).length, 0, "out of the queue");
  const conflicts = await listConflicts();
  assert.equal(conflicts.length, 1, "and into the conflicts, once");
  assert.deepEqual(conflicts[0].mine, mine);
});

test("the writing is never in both places and never in neither", async () => {
  await enqueue(queued);

  for (const attempt of [
    () => moveQueuedToConflict(M, unstorable(conflict())),
    () => moveQueuedToConflict(M, conflict()),
  ]) {
    await attempt();
    const copies = (await listQueue()).length + (await listConflicts()).length;
    assert.equal(copies, 1, "exactly one copy of this save exists at all times");
  }
});

test("moving a mutation that is not queued does not invent a conflict", async () => {
  assert.equal(await moveQueuedToConflict(M, conflict()), true, "nothing to move");
  assert.equal((await listConflicts()).length, 1, "the conflict the server reported is recorded");
  assert.equal((await listQueue()).length, 0);
});

/* ══ 2. keeping mine, which puts it back in the queue ══════ */

test("the conflict survives when the re-queued save cannot be written", async () => {
  await moveQueuedToConflict(M, conflict());

  const moved = await moveConflictToQueue(
    `journal:${ROW}`,
    unstorable(
      newQueuedMutation({
        mutationId: N,
        entity: "journal",
        entityId: ROW,
        localId: `journal:${ROW}`,
        baseUpdatedAt: "2026-09-20T00:00:00.000Z",
        payload: mine,
      })
    )
  );

  assert.equal(moved, false);
  const conflicts = await listConflicts();
  assert.equal(conflicts.length, 1, "the conflict is still there to resolve");
  assert.deepEqual(conflicts[0].mine, mine, "still holding the writing");
  assert.equal((await listQueue()).length, 0, "and nothing half-made a queue entry");
});

test("keeping mine removes the conflict only once the save is durably queued", async () => {
  await moveQueuedToConflict(M, conflict());

  const mutation = newQueuedMutation({
    mutationId: N,
    entity: "journal",
    entityId: ROW,
    localId: `journal:${ROW}`,
    baseUpdatedAt: "2026-09-20T00:00:00.000Z",
    payload: mine,
  });
  assert.equal(await moveConflictToQueue(`journal:${ROW}`, mutation), true);

  assert.equal((await listConflicts()).length, 0);
  const queue = await listQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].mutationId, N, "a new mutation id — the old one was spent");
  assert.equal(
    queue[0].baseUpdatedAt,
    "2026-09-20T00:00:00.000Z",
    "based on the version the author was shown, which is what makes it an overwrite they chose"
  );
});

test("a later edit is not replaced by the conflict's older writing", async () => {
  // The conflict holds what was written before the refusal. If the author has
  // typed since, that newer save is already queued — and collapsing the
  // conflict's payload into it would quietly undo everything typed after.
  await moveQueuedToConflict(M, conflict());
  await enqueue({
    mutationId: "33333333-3333-4333-8333-333333333333",
    entity: "journal",
    entityId: ROW,
    localId: `journal:${ROW}`,
    baseUpdatedAt: "2026-09-20T00:00:00.000Z",
    payload: { fields: { title: "Newer still" }, blocks: [], tagIds: [] },
  });

  await moveConflictToQueue(
    `journal:${ROW}`,
    newQueuedMutation({
      mutationId: N,
      entity: "journal",
      entityId: ROW,
      localId: `journal:${ROW}`,
      baseUpdatedAt: "2026-09-20T00:00:00.000Z",
      payload: mine,
    })
  );

  const titles = (await listQueue())
    .map((entry) => String(entry.payload.fields.title))
    .sort();
  assert.deepEqual(
    titles,
    ["Newer still", "What I wrote on the train"],
    "both intents are queued; neither overwrote the other"
  );
});

/* ══ 3. nothing disappears when storage simply says no ═════ */

test("a storage refusal at any point leaves something recoverable", async () => {
  await enqueue(queued);

  // Refused on the way out...
  await moveQueuedToConflict(M, unstorable(conflict()));
  assert.equal((await listQueue()).length, 1);

  // ...and refused on the way back.
  await moveQueuedToConflict(M, conflict());
  await moveConflictToQueue(
    `journal:${ROW}`,
    unstorable(newQueuedMutation({ ...queued, mutationId: N }))
  );
  assert.equal((await listConflicts()).length, 1);

  // At no point did the studio hold zero copies.
  const everything = [...(await dbGetAll("outbox")), ...(await dbGetAll("conflicts"))];
  assert.equal(everything.length > 0, true, "the writing is still on the device");
});
