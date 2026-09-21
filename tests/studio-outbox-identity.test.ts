import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll } from "../lib/studio-local/db";
import {
  claimForSending,
  enqueue,
  listQueue,
  oneSavePerRow,
  recordAttempt,
  releaseStaleSends,
  type QueuedMutation,
} from "../lib/studio-local/outbox";

/**
 * Sending is now a *claim* with an owner rather than an ownerless boolean, so
 * these tests name the tab doing it. What they assert is unchanged: taking an
 * entry to send is what makes its payload permanent.
 */
const THIS_TAB = "tab-under-test";
import { rebaseQueued } from "../lib/studio-sync-contract";

/**
 * A mutation id means one save, for ever.
 *
 * ── the false acknowledgement this file exists to end ──
 *
 * The queue coalesces: a second save of the same row replaces the first rather
 * than stacking up, because the save functions replace a document wholesale
 * and an older copy has nothing the newer one lacks. That is right — right up
 * to the moment the first copy has been *sent*.
 *
 * What went wrong:
 *
 *   1. A is queued as mutation M and sent.
 *   2. The server applies M/A and writes M into its ledger.
 *   3. The response dies on the way back. The queue clears `sending`.
 *   4. The author writes B and saves.
 *   5. Coalescing replaces M's payload with B, keeping the id M.
 *   6. M/B is sent. The ledger says "M already applied" — correctly — and
 *      returns A's result without looking at B at all.
 *   7. The client dequeues M and marks the editor synced.
 *
 * B is now gone from the queue, absent from the server, and reported as saved.
 * The idempotency ledger did exactly its job; the client broke the contract it
 * depends on by giving one id two meanings.
 *
 * The rule these tests pin: coalescing is allowed only while a mutation has
 * never left the device.
 */

const A = { fields: { title: "A — what the server got" }, blocks: [], tagIds: [] };
const B = { fields: { title: "B — the newer edit" }, blocks: [], tagIds: [] };

const M = "11111111-1111-4111-8111-111111111111";
const N = "22222222-2222-4222-8222-222222222222";
const P = "33333333-3333-4333-8333-333333333333";

const row = {
  entity: "journal" as const,
  entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  localId: "journal:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};

beforeEach(async () => {
  await dbClearAll();
});

const title = (entry: QueuedMutation) => String(entry.payload.fields.title);

/* ── 1. the reported failure ──────────────────────────────── */

test("a save made after a lost acknowledgement gets its own mutation id", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M); // the answer never came back

  const { mutation } = await enqueue({ mutationId: N, ...row, payload: B });

  assert.equal(mutation.mutationId, N, "B is its own mutation, not a rewrite of M");

  const queue = await listQueue();
  assert.equal(queue.length, 2, "both intents are still on the device");
  assert.equal(title(queue.find((e) => e.mutationId === M)!), "A — what the server got");
  assert.equal(title(queue.find((e) => e.mutationId === N)!), "B — the newer edit");
});

test("an attempted mutation's payload is never rewritten", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M);

  await enqueue({ mutationId: N, ...row, payload: B });

  const sent = (await listQueue()).find((entry) => entry.mutationId === M);
  assert.equal(
    title(sent!),
    "A — what the server got",
    "M still means exactly what the server was told it meant"
  );
});

test("a reload does not make an attempted mutation collapsible again", async () => {
  // A tab closed mid-request leaves `sending` set, and releaseStaleSends()
  // clears it at startup so the entry can be sent normally. That flag was the
  // only thing standing between an attempted mutation and a rewrite, so
  // clearing it re-opened the whole failure — with `attempts` still at zero,
  // because an answer is what increments it and no answer ever came.
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);

  await releaseStaleSends(THIS_TAB); // the app restarts

  const { mutation } = await enqueue({ mutationId: N, ...row, payload: B });
  assert.equal(mutation.mutationId, N, "it was attempted, so it is frozen");

  const sent = (await listQueue()).find((entry) => entry.mutationId === M);
  assert.equal(title(sent!), "A — what the server got");
  assert.equal(sent!.sending, false, "but it is sendable again");
});

/* ── 2. coalescing is still allowed where it is safe ─────── */

test("two saves made with no network in between are still collapsed", async () => {
  // This is the case coalescing exists for: typing, saving, typing more,
  // saving again, all before anything reaches a wire. Nothing has been
  // promised to anybody, so there is nothing to keep.
  await enqueue({ mutationId: M, ...row, payload: A });
  const { mutation } = await enqueue({ mutationId: N, ...row, payload: B });

  assert.equal(mutation.mutationId, M, "the unsent entry is reused");
  const queue = await listQueue();
  assert.equal(queue.length, 1);
  assert.equal(title(queue[0]), "B — the newer edit");
});

test("a collapsed save keeps the version the first edit was written against", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  const { mutation } = await enqueue({
    ...row,
    mutationId: N,
    baseUpdatedAt: "2026-09-20T00:00:00.000Z",
    payload: B,
  });

  assert.equal(
    mutation.baseUpdatedAt,
    "2026-09-19T00:00:00.000Z",
    "typing more does not make the edit fresher"
  );
});

test("a blocked mutation is not collapsed into either", async () => {
  // It has been to the server and come back refused. Its payload is the thing
  // the author is being asked to fix, so it must still be the thing they see.
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M);

  const { mutation } = await enqueue({ mutationId: N, ...row, payload: B });
  assert.notEqual(mutation.mutationId, M);
});

/* ── 3. a retry sends exactly what was sent before ───────── */

test("a retry carries the original payload, byte for byte", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M, "The studio server answered 503.");

  const retried = (await listQueue()).find((entry) => entry.mutationId === M)!;

  assert.deepEqual(retried.payload, A);
  assert.equal(retried.baseUpdatedAt, row.baseUpdatedAt);
  assert.equal(retried.attempts, 1);
  assert.equal(retried.sending, false, "and it is queued to go again");
});

/* ── 4. one row at a time ─────────────────────────────────── */

test("only one save per row goes in a request", async () => {
  // Once A and B are separate mutations they can both be waiting. They cannot
  // both be sent at once: the server applies them in order and B's base still
  // names the version from before A landed, so B would come back as a conflict
  // with the author's own writing. A goes, the rest are rebased onto it, and
  // B goes in the next round.
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M);
  await enqueue({ mutationId: N, ...row, payload: B });
  await enqueue({
    mutationId: P,
    entity: "project",
    entityId: null,
    localId: "project:new-1",
    baseUpdatedAt: null,
    payload: { fields: { title: "A different thing" }, blocks: [], tagIds: [] },
  });

  const batch = oneSavePerRow(await listQueue());

  assert.equal(batch.length, 2, "one journal save and one project save");
  assert.equal(batch[0].mutationId, M, "the oldest entry for the row goes first");
  assert.equal(
    batch.filter((entry: QueuedMutation) => entry.localId === row.localId).length,
    1,
    "never two saves of the same row in one request"
  );
});

test("the held-back save is rebased onto what the first one produced", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M);
  await enqueue({ mutationId: N, ...row, payload: B });

  const afterA = rebaseQueued(
    (await listQueue()).filter((entry) => entry.mutationId !== M),
    { localId: row.localId, entity: "journal", id: row.entityId, updatedAt: "2026-09-21T10:00:00.000Z" }
  );

  assert.equal(afterA.length, 1);
  assert.equal(afterA[0].mutationId, N);
  assert.equal(
    afterA[0].baseUpdatedAt,
    "2026-09-21T10:00:00.000Z",
    "so B is an edit to A, not a conflict with it"
  );
});

/* ── 5. a create, and then edits to what it created ──────── */

test("an edit made before the create was acknowledged targets the new row", async () => {
  const create = {
    entity: "project" as const,
    entityId: null,
    localId: "project:new-7",
    baseUpdatedAt: null,
  };
  await enqueue({ mutationId: M, ...create, payload: A });
  await claimForSending(M, THIS_TAB);
  await recordAttempt(M);
  await enqueue({ mutationId: N, ...create, payload: B });

  const server = { localId: "project:new-7", entity: "project" as const, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", updatedAt: "2026-09-21T10:00:00.000Z" };
  const rebased = rebaseQueued(
    (await listQueue()).filter((entry) => entry.mutationId !== M),
    server
  );

  assert.equal(rebased[0].entityId, server.id, "the follow-up edits the row that was created");
  assert.equal(rebased[0].baseUpdatedAt, server.updatedAt);
});

/* ── 6. several sequential saves of one document ─────────── */

test("a document can be saved three times over without losing the middle one", async () => {
  const ids = [M, N, P];
  const payloads = [A, B, { fields: { title: "C — later still" }, blocks: [], tagIds: [] }];

  for (let i = 0; i < 3; i++) {
    await enqueue({ mutationId: ids[i], ...row, payload: payloads[i] });
    await claimForSending(ids[i], THIS_TAB);
    await recordAttempt(ids[i]);
  }

  const queue = await listQueue();
  assert.equal(queue.length, 3, "three intents, three ids");
  assert.deepEqual(
    queue.map(title),
    ["A — what the server got", "B — the newer edit", "C — later still"],
    "in the order they were written"
  );
});
