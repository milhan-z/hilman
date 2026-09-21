import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll } from "../lib/studio-local/db";
import { enqueue, listQueue } from "../lib/studio-local/outbox";
import { flushOutbox, subscribeSyncEvents, type AppliedSave } from "../lib/studio-local/sync";
import type { SyncMutation, SyncOutcome } from "../lib/studio-sync-contract";

/**
 * A lost response, and the writing that came after it.
 *
 * This is the whole of F02 as one story, driven through the real queue and the
 * real flush against a server that behaves exactly as migration 0006 makes it
 * behave — including the idempotency ledger, which is the part that turns a
 * client-side id collision into silent data loss:
 *
 *   save A  →  server applies A  →  response lost
 *   write B →  save B            →  flush
 *
 * If B is allowed to inherit A's mutation id, the ledger recognises the id,
 * reports A's result, and never looks at B. B leaves the queue, is reported
 * as saved, and exists nowhere. The server is not at fault; it was told the
 * same question twice and gave the same answer twice.
 *
 * What is asserted below is the client keeping its half of the contract.
 */

const ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  entity: "journal" as const,
  entityId: ROW,
  localId: `journal:${ROW}`,
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};

const M = "11111111-1111-4111-8111-111111111111";
const N = "22222222-2222-4222-8222-222222222222";

const payload = (title: string) => ({ fields: { title }, blocks: [], tagIds: [] });

/**
 * A stand-in for /api/studio/sync + save_content_synced.
 *
 * Small on purpose — it only needs the two behaviours that matter here: an
 * optimistic-concurrency check, and a ledger that replays a known mutation id
 * without writing. `dropResponse` is how a dying connection is spelled: the
 * write lands, the answer does not.
 */
function fakeServer() {
  const ledger = new Map<string, { id: string; updatedAt: string }>();
  const stored: { title: string; updatedAt: string } = {
    title: "what the site starts with",
    updatedAt: "2026-09-19T00:00:00.000Z",
  };
  let clock = 0;
  const seen: { mutationId: string; title: string }[] = [];
  let dropNext = false;

  async function handle(mutations: SyncMutation[]): Promise<SyncOutcome[]> {
    return mutations.map((mutation) => {
      seen.push({
        mutationId: mutation.mutationId,
        title: String(mutation.payload.fields.title),
      });

      const replay = ledger.get(mutation.mutationId);
      if (replay) {
        return { status: "saved", mutationId: mutation.mutationId, localId: mutation.localId, id: replay.id, updatedAt: replay.updatedAt, replayed: true };
      }

      if (mutation.entityId && mutation.baseUpdatedAt !== stored.updatedAt) {
        return {
          status: "conflict",
          mutationId: mutation.mutationId,
          localId: mutation.localId,
          id: ROW,
          serverUpdatedAt: stored.updatedAt,
          server: { id: ROW, updatedAt: stored.updatedAt, fields: { title: stored.title }, blocks: [], tagIds: [] },
        };
      }

      stored.title = String(mutation.payload.fields.title);
      stored.updatedAt = `2026-09-2${++clock}T00:00:00.000Z`;
      ledger.set(mutation.mutationId, { id: ROW, updatedAt: stored.updatedAt });
      return { status: "saved", mutationId: mutation.mutationId, localId: mutation.localId, id: ROW, updatedAt: stored.updatedAt, replayed: false };
    });
  }

  const fetchStub = async (_url: string, init: { body: string }) => {
    const { mutations } = JSON.parse(init.body) as { mutations: SyncMutation[] };
    const results = await handle(mutations);
    if (dropNext) {
      dropNext = false;
      throw new TypeError("Failed to fetch"); // applied, but never acknowledged
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ results }),
    };
  };

  return {
    fetchStub,
    seen,
    stored,
    dropResponse() {
      dropNext = true;
    },
  };
}

/**
 * Flushes until the queue is empty.
 *
 * One flush deliberately sends at most one save per row, so a row with two
 * waiting mutations takes two rounds. In the app the second round is a
 * scheduled retry; here it is spelled out rather than waited on, so the test
 * does not depend on a timer.
 */
async function drain(rounds = 5) {
  for (let i = 0; i < rounds; i++) {
    await flushOutbox();
    if ((await listQueue()).length === 0) return;
  }
}

let applied: AppliedSave[] = [];
let unsubscribe = () => {};

beforeEach(async () => {
  await dbClearAll();
  applied = [];
  unsubscribe();
  unsubscribe = subscribeSyncEvents((event) => {
    if (event.type === "applied") applied.push(event.save);
  });
});

/* ── the reported failure, end to end ─────────────────────── */

test("an acknowledgement for A never reports B as saved", async () => {
  const server = fakeServer();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;

  // 1. A is queued and sent. The server applies it; the answer is lost.
  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  server.dropResponse();
  await flushOutbox();

  assert.equal(applied.length, 0, "nothing was acknowledged — the reply never arrived");
  assert.equal(server.stored.title, "A", "but the site does have A");

  // 2. The author keeps writing and saves again.
  await enqueue({ mutationId: N, ...row, payload: payload("B") });

  const queued = await listQueue();
  assert.equal(queued.length, 2, "A is still awaiting its answer, B is behind it");

  // 3. Everything goes out. A is recognised as a replay; B is new work.
  await drain();

  const forB = applied.filter((save) => save.mutationId === N);
  const forA = applied.filter((save) => save.mutationId === M);

  assert.equal(forA.length, 1, "A's replayed result is reported against A's id");
  assert.equal(forB.length, 1, "and B gets its own acknowledgement");
  assert.equal(server.stored.title, "B", "B actually reached the site");
  assert.equal((await listQueue()).length, 0, "and the queue is empty because both landed");
});

test("the server is never asked the same question with a different answer", async () => {
  const server = fakeServer();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;

  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  server.dropResponse();
  await flushOutbox();
  await enqueue({ mutationId: N, ...row, payload: payload("B") });
  await drain();

  // Every payload the server ever saw under a given id must be identical.
  const byId = new Map<string, Set<string>>();
  for (const call of server.seen) {
    if (!byId.has(call.mutationId)) byId.set(call.mutationId, new Set());
    byId.get(call.mutationId)!.add(call.title);
  }
  for (const [id, titles] of byId) {
    assert.equal(titles.size, 1, `${id} carried ${[...titles].join(" and ")}`);
  }
});

test("every acknowledgement says which exact save it is for", async () => {
  const server = fakeServer();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;

  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  await flushOutbox();

  assert.equal(applied.length, 1);
  assert.equal(applied[0].mutationId, M, "not just the document — the save");
  assert.equal(applied[0].localId, row.localId);
  assert.equal(applied[0].id, ROW);
});

test("a second save of the same row waits its turn rather than conflicting", async () => {
  // Both are waiting and both target the same row. Sending them together
  // would hand the server a stale base for the second one and produce a
  // conflict between the author and themselves.
  const server = fakeServer();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;

  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  server.dropResponse();
  await flushOutbox();
  await enqueue({ mutationId: N, ...row, payload: payload("B") });

  await drain();

  assert.equal(
    applied.filter((save) => save.mutationId === N).length,
    1,
    "B was saved, not refused as a conflict with A"
  );
  assert.equal(server.stored.title, "B");
});

test("a save that has not been attempted is still collapsed before it is sent", async () => {
  const server = fakeServer();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;

  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  await enqueue({ mutationId: N, ...row, payload: payload("B") });
  await flushOutbox();

  assert.equal(server.seen.length, 1, "one request carrying the newer version");
  assert.equal(server.seen[0].title, "B");
  assert.equal(server.stored.title, "B");
});
