import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { dbClearAll } from "../lib/studio-local/db";
import { enqueue, listQueue } from "../lib/studio-local/outbox";
import { flushOutbox, refreshSyncState, subscribeSync } from "../lib/studio-local/sync";
import type { SyncMutation, SyncPayload } from "../lib/studio-sync-contract";

const M = "11111111-1111-4111-8111-111111111111";
const N = "22222222-2222-4222-8222-222222222222";
const ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = { entity: "journal" as const, entityId: ROW, localId: `journal:${ROW}`, baseUpdatedAt: "2026-09-19T00:00:00.000Z" };
const payload = (title: string): SyncPayload => ({ fields: { title }, blocks: [], tagIds: [] });

beforeEach(async () => {
  await dbClearAll();
  await refreshSyncState();
});

// refreshSyncState reports the candidates before runFlush claims them. Queue
// a newer save in that real asynchronous window, without a production seam.
function replaceBeforeClaim(next: SyncPayload) {
  let replacement: ReturnType<typeof enqueue> | undefined;
  const unsubscribe = subscribeSync((state) => {
    if (state.queued === 1 && !replacement) {
      replacement = enqueue({ mutationId: N, ...row, payload: next });
    }
  });
  return { unsubscribe, replacement: () => replacement };
}

test("a save collapsed after candidate selection sends the newly claimed payload", async (t) => {
  const sent: SyncMutation[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const { mutations } = JSON.parse(String(init.body)) as { mutations: SyncMutation[] };
    sent.push(...mutations);
    return Response.json({ results: mutations.map((mutation) => ({
      status: "saved", mutationId: mutation.mutationId, localId: mutation.localId,
      id: ROW, updatedAt: "2026-09-20T00:00:00.000Z", replayed: false,
    })) });
  });
  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  const race = replaceBeforeClaim(payload("B"));
  try {
    await flushOutbox();
    assert.equal((await race.replacement())?.mutation.mutationId, M, "B collapsed into unsent A");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].payload.fields.title, "B", "the acknowledged payload is the latest durable writing");
    assert.equal((await listQueue()).length, 0);
  } finally {
    race.unsubscribe();
  }
});

test("a candidate replaced with pending media is held without freezing its mutation", async (t) => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    return Response.json({ results: [] });
  });
  await enqueue({ mutationId: M, ...row, payload: payload("A") });
  const next = payload("B");
  next.fields.cover_image = "pending:33333333-3333-4333-8333-333333333333";
  const race = replaceBeforeClaim(next);
  try {
    await flushOutbox();
    await race.replacement();
    assert.equal(requests, 0, "no pending ref or stale version leaves the device");
    const [waiting] = await listQueue();
    assert.deepEqual(waiting.payload, next);
    assert.equal(waiting.attemptedAt, undefined, "the media rewrite may still resolve this unsent payload");
  } finally {
    race.unsubscribe();
  }
});
