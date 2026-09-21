import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll } from "../lib/studio-local/db";
import {
  SEND_LEASE_MS,
  claimForSending,
  enqueue,
  listQueue,
  rebaseAfterApplied,
  releaseClaim,
  releaseExpiredClaims,
  type QueuedMutation,
} from "../lib/studio-local/outbox";

/**
 * The queue, when more than one thing is touching it.
 *
 * ── the lost updates this file exists to end ──
 *
 * Every write to the outbox was a read of the whole store, a decision in JS,
 * and then a write — three steps, two or three separate IndexedDB
 * transactions, and nothing holding anything in between. That is a lost update
 * waiting for a second actor, and this studio has several: a save while a
 * flush is applying an answer, a photo upload rewriting references, a second
 * tab, a retry timer.
 *
 * The worst of them was `replaceQueue`, which *clears the entire store* and
 * writes back the list it read a moment ago. A save made in that window is not
 * merely stale — it is deleted, having been written to storage successfully
 * and reported to the author as safe. There is no copy of it anywhere
 * afterwards.
 *
 * ── and the claim ──
 *
 * `sending` was a boolean with no owner on it, and `releaseStaleSends()` ran
 * at startup in every tab and cleared all of them. So opening a second tab
 * while the first was mid-request took the first tab's in-flight work and sent
 * it again. Pass 1's `attemptedAt` stops that corrupting a payload; it does
 * not stop two tabs sending the same thing, nor a tab that dies holding work
 * nobody else will pick up.
 *
 * A claim needs an owner and an expiry: mine, or nobody's, or long enough ago
 * that the holder is plainly gone.
 */

const A = { fields: { title: "A" }, blocks: [], tagIds: [] };
const B = { fields: { title: "B" }, blocks: [], tagIds: [] };

const id = (n: string) => `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const M = id("1");
const N = id("2");
const P = id("3");

const row = {
  entity: "journal" as const,
  entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  localId: "journal:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};

const other = {
  entity: "project" as const,
  entityId: null,
  localId: "project:new-1",
  baseUpdatedAt: null,
};

const TAB_A = "tab-a";
const TAB_B = "tab-b";

beforeEach(async () => {
  await dbClearAll();
});

const titles = (queue: QueuedMutation[]) =>
  queue.map((entry) => String(entry.payload.fields.title)).sort();

/* ══ 1. two writes to the queue at once ════════════════════ */

test("two saves enqueued at the same moment both survive", async () => {
  // Not awaited in turn: both read the store before either has written, which
  // is precisely the window a read-decide-write across separate transactions
  // leaves open.
  const [first, second] = await Promise.all([
    enqueue({ mutationId: M, ...row, payload: A }),
    enqueue({ mutationId: N, ...other, payload: B }),
  ]);

  assert.equal(first.stored, true);
  assert.equal(second.stored, true);
  assert.deepEqual(titles(await listQueue()), ["A", "B"], "neither overwrote the other");
});

test("two saves of the same row at once do not become one lost payload", async () => {
  // These legitimately collapse — neither has been sent. What must not happen
  // is both deciding to collapse into the same entry and one of them winning
  // the write, so that a save the author was told was safe is simply absent.
  await Promise.all([
    enqueue({ mutationId: M, ...row, payload: A }),
    enqueue({ mutationId: N, ...row, payload: B }),
  ]);

  const queue = await listQueue();
  assert.equal(queue.length, 1, "one row, one queued save");
  assert.equal(
    String(queue[0].payload.fields.title),
    "B",
    "and it is the later of the two, not a coin toss"
  );
});

/* ══ 2. the whole-store replacement ════════════════════════ */

test("a save made while an answer is being applied is not erased", async () => {
  // The reported shape: the flush reads the queue, an acknowledgement arrives,
  // and the rebase writes back what it read — clearing the store on the way.
  // Anything enqueued in between was written, reported safe, and deleted.
  await enqueue({ mutationId: M, ...row, payload: A });

  const rebase = rebaseAfterApplied(M, {
    localId: row.localId,
    entity: "journal",
    id: row.entityId,
    updatedAt: "2026-09-21T10:00:00.000Z",
  });
  const racing = enqueue({ mutationId: P, ...other, payload: B });
  await Promise.all([rebase, racing]);

  const queue = await listQueue();
  assert.equal(
    queue.some((entry) => entry.mutationId === P),
    true,
    "the save made during the rebase is still here"
  );
  assert.equal(
    queue.some((entry) => entry.mutationId === M),
    false,
    "and the acknowledged one is gone, which is the point of the rebase"
  );
});

test("the rebase still moves waiting saves onto what just landed", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);
  await releaseClaim(M, TAB_A);
  await enqueue({ mutationId: N, ...row, payload: B });

  await rebaseAfterApplied(M, {
    localId: row.localId,
    entity: "journal",
    id: row.entityId,
    updatedAt: "2026-09-21T10:00:00.000Z",
  });

  const queue = await listQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].mutationId, N);
  assert.equal(
    queue[0].baseUpdatedAt,
    "2026-09-21T10:00:00.000Z",
    "so it is an edit to what landed, not a conflict with it"
  );
});

test("the rebase leaves other rows alone", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await enqueue({ mutationId: P, ...other, payload: B });

  await rebaseAfterApplied(M, {
    localId: row.localId,
    entity: "journal",
    id: row.entityId,
    updatedAt: "2026-09-21T10:00:00.000Z",
  });

  const untouched = (await listQueue()).find((entry) => entry.mutationId === P);
  assert.equal(untouched?.baseUpdatedAt, null, "a different document is not rebased");
});

/* ══ 3. one sender at a time ═══════════════════════════════ */

test("only one tab can claim a mutation to send", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });

  const [a, b] = await Promise.all([claimForSending(M, TAB_A), claimForSending(M, TAB_B)]);

  assert.equal([a, b].filter(Boolean).length, 1, "exactly one sender, not two");
});

test("a second tab does not take work the first is still doing", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  assert.equal(await claimForSending(M, TAB_A), true);

  assert.equal(await claimForSending(M, TAB_B), false, "B waits rather than sending it too");

  // And B starting up must not clear A's claim the way releaseStaleSends did.
  await releaseExpiredClaims(TAB_B);
  assert.equal(await claimForSending(M, TAB_B), false, "still A's");
});

test("the holder can reclaim its own work without waiting", async () => {
  // A tab that reloads keeps its identity for the session, so its own
  // interrupted send is available again immediately rather than after a lease.
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);

  assert.equal(await claimForSending(M, TAB_A), true, "mine already");
  await releaseExpiredClaims(TAB_A);
  assert.equal(await claimForSending(M, TAB_A), true);
});

test("a sender that dies is eventually recovered by another tab", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);

  // Nothing from A ever comes back. Long enough later, B may take it.
  const later = Date.now() + SEND_LEASE_MS + 1_000;
  assert.equal(await claimForSending(M, TAB_B, later), true, "the lease has run out");

  const entry = (await listQueue()).find((item) => item.mutationId === M);
  assert.equal(entry?.claimedBy, TAB_B);
  assert.deepEqual(entry?.payload, A, "and the writing it was holding is untouched");
});

test("releasing a claim hands it back without touching the payload", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);
  await releaseClaim(M, TAB_A);

  const entry = (await listQueue()).find((item) => item.mutationId === M);
  assert.equal(entry?.claimedBy, undefined);
  assert.deepEqual(entry?.payload, A);
  assert.equal(await claimForSending(M, TAB_B), true, "anyone may take it now");
});

test("a tab cannot release a claim it does not hold", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);

  await releaseClaim(M, TAB_B);

  const entry = (await listQueue()).find((item) => item.mutationId === M);
  assert.equal(entry?.claimedBy, TAB_A, "B does not get to hand back A's work");
});

test("a claimed mutation is still frozen against collapsing", async () => {
  // Pass 1's guarantee: claiming is attempting. The payload must not change.
  await enqueue({ mutationId: M, ...row, payload: A });
  await claimForSending(M, TAB_A);

  const { mutation } = await enqueue({ mutationId: N, ...row, payload: B });
  assert.equal(mutation.mutationId, N, "B is its own save");

  const sent = (await listQueue()).find((entry) => entry.mutationId === M);
  assert.equal(String(sent!.payload.fields.title), "A");
});

test("two documents can be sent by two tabs at the same time", async () => {
  await enqueue({ mutationId: M, ...row, payload: A });
  await enqueue({ mutationId: P, ...other, payload: B });

  assert.equal(await claimForSending(M, TAB_A), true);
  assert.equal(await claimForSending(P, TAB_B), true, "different work, no contention");
});

test("claiming something that is no longer queued simply fails", async () => {
  assert.equal(await claimForSending(M, TAB_A), false);
});
