import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";

import { dbClearAll, dbPut } from "../lib/studio-local/db";
import type { PendingMedia } from "../lib/studio-local/media";
import { enqueue, listQueue, rewriteQueuedPlaceholders } from "../lib/studio-local/outbox";
import { flushOutbox, getSyncState, subscribeSyncEvents, type SyncState } from "../lib/studio-local/sync";
import type { SyncMutation, SyncOutcome } from "../lib/studio-sync-contract";

/**
 * The order things leave the device in, and the queue while it is being rewritten.
 *
 * Three behaviours of the flush, and one of the queue they depend on:
 *
 *   - A save asked for while a round is already running is not left waiting for
 *     the next trigger. It goes in a follow-up round, and everyone who asked
 *     shares that one round.
 *   - Writing that names no placeholder does not wait behind a recording that is
 *     still uploading. The save goes first; the files follow in a scheduled round.
 *   - Writing that does name a placeholder still waits for the upload, as before.
 *
 * The rewrite of placeholders into uploaded keys is one transaction, so a save
 * made while it runs is neither erased nor touched.
 *
 * The network is a stand-in at the fetch boundary: /api/studio/sync answers with
 * every mutation saved, /api/r2/sign answers with whatever status a test sets,
 * and the R2 PUT is stubbed. Nothing leaves the process.
 */

const ROW_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ROW_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const rowA = {
  entity: "journal" as const,
  entityId: ROW_A,
  localId: `journal:${ROW_A}`,
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};
const rowB = {
  entity: "journal" as const,
  entityId: ROW_B,
  localId: `journal:${ROW_B}`,
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};
const other = {
  entity: "project" as const,
  entityId: null,
  localId: "project:new-1",
  baseUpdatedAt: null,
};

const M = "11111111-1111-4111-8111-111111111111";
const N = "22222222-2222-4222-8222-222222222222";
const O = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";

const VOICE_ID = "55555555-5555-4555-8555-555555555555";
const REF = `pending:${VOICE_ID}`;
const VOICE_KEY = `voice-notes/${VOICE_ID}.m4a`;

const SYNC = "/api/studio/sync";
const SIGN = "/api/r2/sign";
const PUT_URL = "https://r2.example/put";

const payload = (title: string) => ({ fields: { title }, blocks: [], tagIds: [] });
const namingRef = (title: string, ref: string) => ({
  fields: { title, voice_note: { src: ref } },
  blocks: [],
  tagIds: [],
});

/* ── fixtures, copied from voice-note-media.test.ts ───────── */

const pendingRecord = (ref: string, kind: PendingMedia["kind"] = "image"): PendingMedia => ({
  ref,
  kind,
  blob: new Blob(["the actual bytes"]),
  name: "photo.jpg",
  type: "image/jpeg",
  size: 16,
  folder: "hilman",
  capturedAt: "2026-09-21T00:00:00.000Z",
  attempts: 0,
});

const voiceRecord = (ref: string): PendingMedia => ({
  ...pendingRecord(ref, "voice-note"),
  name: "voice.m4a",
  type: "audio/mp4",
});

/* ── the stand-in network ─────────────────────────────────── */

function freshNetwork() {
  return {
    /** Every URL fetched, in order. */
    requests: [] as string[],
    /** Mutation ids the sync endpoint has saved, in order. */
    received: [] as string[],
    /** What /api/r2/sign answers. 200 means a working sign, anything else a refusal. */
    signStatus: 200,
    /** When set, the next sync request announces itself and waits for `gate`. */
    hold: null as null | { arrive: () => void; gate: Promise<void> },
  };
}

let net = freshNetwork();
const realFetch = globalThis.fetch;

function installNetwork() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    net.requests.push(url);

    if (url === SYNC) {
      const { mutations } = JSON.parse(String(init?.body)) as { mutations: SyncMutation[] };
      if (net.hold) {
        const { arrive, gate } = net.hold;
        net.hold = null;
        arrive();
        await gate;
      }
      const results = mutations.map((mutation): SyncOutcome => {
        net.received.push(mutation.mutationId);
        return {
          status: "saved",
          mutationId: mutation.mutationId,
          localId: mutation.localId,
          id: mutation.entityId ?? "",
          updatedAt: "2026-09-22T00:00:00.000Z",
          replayed: false,
        };
      });
      return Response.json({ results });
    }

    if (url === SIGN) {
      if (net.signStatus !== 200) {
        return Response.json({ error: "R2 is briefly unavailable." }, { status: net.signStatus });
      }
      return Response.json({ uploadUrl: PUT_URL, key: VOICE_KEY, publicUrl: "/x" });
    }

    if (url === PUT_URL) return new Response(null, { status: 200 });

    throw new Error(`unexpected request in a flush-order test: ${url}`);
  }) as typeof fetch;
}

/**
 * Holds the next sync request open, so a flush can be caught mid-flight.
 *
 * `arrived` resolves once that request is on the wire; `letGo` answers it.
 */
function holdNextSync() {
  let arrive!: () => void;
  let letGo!: () => void;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));
  const gate = new Promise<void>((resolve) => (letGo = resolve));
  net.hold = { arrive, gate };
  return { arrived, letGo };
}

/**
 * Runs rounds until no retry is scheduled, so no timer or follow-up outlives its test.
 *
 * A round that leaves a retry or a deferred round behind schedules a timer; the
 * next round either clears it (empty queue) or sends the work. Asserting the end
 * state here means a leak fails the test that caused it, not a later one.
 */
async function settle() {
  for (let round = 0; round < 5; round++) {
    await flushOutbox();
    if (getSyncState().nextRetryAt === null) break;
  }
  assert.equal(getSyncState().nextRetryAt, null, "no retry is left scheduled past this test");
}

let applied: string[] = [];
let unsubscribe = () => {};

beforeEach(async () => {
  await dbClearAll();
  net = freshNetwork();
  installNetwork();
  applied = [];
  unsubscribe();
  unsubscribe = subscribeSyncEvents((event) => {
    if (event.type === "applied") applied.push(event.save.mutationId);
  });
});

afterEach(() => {
  globalThis.fetch = realFetch;
  unsubscribe();
});

/* ══ 1. a save asked for during a flight ═══════════════════ */

test("two calls made while a flush is running share one follow-up promise", { timeout: 5_000 }, async () => {
  await enqueue({ mutationId: M, ...rowA, payload: payload("A") });
  const hold = holdNextSync();
  const running = flushOutbox();
  await hold.arrived;

  await enqueue({ mutationId: N, ...rowB, payload: payload("B") });
  const first = flushOutbox();
  const second = flushOutbox();

  assert.equal(second, first, "both callers are given the same follow-up round");

  hold.letGo();
  await Promise.all([running, first]);
  await settle();
});

test("a save asked for while a flush is running goes out in a follow-up round, and waiting on it waits for that round", { timeout: 5_000 }, async () => {
  await enqueue({ mutationId: M, ...rowA, payload: payload("A") });
  const hold = holdNextSync();
  const running = flushOutbox();
  await hold.arrived;

  await enqueue({ mutationId: N, ...rowB, payload: payload("B") });
  const waiting = flushOutbox();
  hold.letGo();
  await waiting;

  assert.deepEqual(net.received, [M, N], "by the time the waiting call returns, B has reached the server after A");
  assert.equal(applied.includes(N), true, "and B is acknowledged");

  await running;
  await settle();
});

/* ══ 2. writing ahead of a recording ═══════════════════════ */

test("writing that names no placeholder is sent before a stashed recording uploads", { timeout: 5_000 }, async () => {
  await dbPut("media", voiceRecord(REF));
  await enqueue({ mutationId: M, ...rowA, payload: payload("Plain") });
  net.signStatus = 503;

  await flushOutbox();

  assert.equal(net.requests[0], SYNC, "the first request is the save, not the upload");
  assert.deepEqual(applied, [M], "and the save is acknowledged");

  await flushOutbox();
  assert.ok(net.requests.includes(SIGN), "the recording is signed for afterwards, in the deferred round");
  assert.ok(net.requests.indexOf(SIGN) > net.requests.indexOf(SYNC), "after the save went out");

  await settle();
});

/* ══ 3. writing that waits for its recording ═══════════════ */

test("a save that names a pending placeholder still waits for its upload", { timeout: 5_000 }, async () => {
  await dbPut("media", voiceRecord(REF));
  await enqueue({ mutationId: M, ...rowA, payload: namingRef("Recording", REF) });
  net.signStatus = 503;

  await flushOutbox();

  assert.deepEqual(net.requests, [SIGN], "the upload is attempted, and no sync request is made");

  // Let the upload finish so the held save goes out and the deferred round is
  // cleared. Nothing is asserted about this step; it only ends the test cleanly.
  net.signStatus = 200;
  await settle();
});

/* ══ 4 and 5. the rewrite of placeholders ══════════════════ */

test("rewriting placeholders never erases a save enqueued at the same time", async () => {
  await enqueue({ mutationId: M, ...rowA, payload: namingRef("X", REF) });

  await Promise.all([
    rewriteQueuedPlaceholders({ [REF.toLowerCase()]: VOICE_KEY }),
    enqueue({ mutationId: N, ...other, payload: payload("Y") }),
  ]);

  const queue = await listQueue();
  assert.equal(queue.length, 2, "both saves are still queued");

  const x = queue.find((entry) => entry.mutationId === M);
  const y = queue.find((entry) => entry.mutationId === N);
  assert.deepEqual(x?.payload, namingRef("X", VOICE_KEY), "X now names the uploaded key");
  assert.deepEqual(y?.payload, payload("Y"), "and Y is intact");
  assert.equal(y?.entity, "project");
});

test("rewriting placeholders changes only the entries that named them", async () => {
  await enqueue({ mutationId: M, ...rowA, payload: namingRef("X", REF) });
  await enqueue({ mutationId: N, ...other, payload: payload("Y") });

  const beforeEntry = (await listQueue()).find((entry) => entry.mutationId === N);
  assert.ok(beforeEntry, "the unrelated entry is queued before the rewrite");
  const before = JSON.stringify(beforeEntry);

  await rewriteQueuedPlaceholders({ [REF.toLowerCase()]: VOICE_KEY });

  const afterEntry = (await listQueue()).find((entry) => entry.mutationId === N);
  assert.equal(JSON.stringify(afterEntry), before, "the unrelated entry is byte-identical");

  const named = (await listQueue()).find((entry) => entry.mutationId === M);
  assert.deepEqual(named?.payload, namingRef("X", VOICE_KEY), "the entry that named the placeholder was rewritten");
});

/**
 * Settles, then waits out anything a zero-delay retry timer started.
 *
 * A round that finishes with work still waiting schedules a timer of 0 ms. That
 * timer can fire while settle()'s last round is running, and the flush it starts
 * is a follow-up nobody awaits, so it would run into the next test. Yielding to
 * the event loop lets the timer fire, and a flush called after that waits for
 * whatever is in flight, so the follow-up is awaited here.
 */
async function drainTimers() {
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushOutbox();
  await settle();
}

/* ══ 6. a text save that keeps asking to retry ═════════════ */

test("a text save the server keeps asking to retry does not keep recordings from uploading", { timeout: 5_000 }, async () => {
  await enqueue({ mutationId: M, ...rowA, payload: payload("Plain") });
  await dbPut("media", voiceRecord(REF));
  net.signStatus = 503;

  // Answers every mutation with "retry", whatever it is, for as long as it is installed.
  const answering = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== SYNC) return answering(input, init);
    net.requests.push(SYNC);
    const { mutations } = JSON.parse(String(init?.body)) as { mutations: SyncMutation[] };
    const results = mutations.map(
      (mutation): SyncOutcome => ({
        status: "retry",
        mutationId: mutation.mutationId,
        localId: mutation.localId,
        message: "The database gave no answer.",
      })
    );
    return Response.json({ results });
  }) as typeof fetch;

  try {
    await flushOutbox();
    await flushOutbox();
    assert.ok(
      net.requests.includes(SIGN),
      "the second round asks to sign the recording, even though the text save is still being refused"
    );
  } finally {
    globalThis.fetch = answering;
  }

  // Let the upload finish and the save go through, so no retry outlives the test.
  net.signStatus = 200;
  await drainTimers();
});

/* ══ 7. a round that fails ═════════════════════════════════ */

test("a round that fails does not stop later callers getting their own round", { timeout: 5_000 }, async () => {
  // A listener that throws on the first "applied" makes applyOutcome throw, which
  // propagates out of runFlush after the save has already been dequeued.
  let throwOnce = true;
  const breaker = subscribeSyncEvents((event) => {
    if (event.type === "applied" && throwOnce) {
      throwOnce = false;
      throw new Error("listener failed");
    }
  });

  let first: Promise<SyncState>;
  try {
    await enqueue({ mutationId: M, ...rowA, payload: payload("A") });
    const hold = holdNextSync();
    const running = flushOutbox();
    await hold.arrived;

    await enqueue({ mutationId: N, ...rowB, payload: payload("B") });
    first = flushOutbox();
    const second = flushOutbox();
    assert.equal(second, first, "both callers are given the same follow-up round");

    hold.letGo();
    await assert.rejects(running, { message: "listener failed" }, "the round that was running fails");
    await assert.doesNotReject(first, "the follow-up round still resolves");
    await assert.doesNotReject(second, "and so does the one shared with the second caller");

    assert.ok(net.received.includes(N), "a save enqueued meanwhile reaches the server");
    assert.equal(applied.includes(N), true, "and it is acknowledged");
  } finally {
    breaker();
  }

  await settle();

  // The shared follow-up was cleared once it ran, so a caller during a later
  // in-flight round gets a new round rather than the old resolved promise.
  await enqueue({ mutationId: O, ...rowA, payload: payload("C") });
  const hold = holdNextSync();
  const running = flushOutbox();
  await hold.arrived;

  await enqueue({ mutationId: P, ...other, payload: payload("D") });
  const later = flushOutbox();
  assert.notEqual(later, first, "a new follow-up is made, not the old one handed back");

  hold.letGo();
  await Promise.all([running, later]);
  assert.ok(net.received.includes(P), "the save made during that round reaches the server");
  await drainTimers();
});
