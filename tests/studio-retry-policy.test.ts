import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll } from "../lib/studio-local/db";
import { claimForSending, enqueue, listQueue } from "../lib/studio-local/outbox";
import { flushOutbox, getSyncState } from "../lib/studio-local/sync";
import { fetchWithTimeout } from "../lib/studio-local/net";
import {
  BACKOFF_STEPS_MS,
  DEFERRED_DELAY_MS,
  MAX_BACKOFF_MS,
  TimeoutError,
  UploadError,
  classifyFailure,
  nextAttempt,
} from "../lib/studio-local/retry-policy";
import type { SyncMutation, SyncOutcome } from "../lib/studio-sync-contract";

/**
 * When to try again, and when to stop calling it a failure.
 *
 * ── the two opposite mistakes ──
 *
 * The sync scheduler reset its backoff on any HTTP 200. But an HTTP 200 from
 * /api/studio/sync means only that the request *arrived*: each mutation in it
 * carries its own verdict, and `retry` is one of them. So a server answering
 * "not now" was read as success, the failure count went back to zero, and —
 * because something was still queued — the next attempt was scheduled with a
 * delay of literally zero. A server having a bad minute got a request as fast
 * as the phone could produce them.
 *
 *     consecutiveFailures = 0;
 *     cancelRetry();
 *     …
 *     if (remaining.length > 0) scheduleRetry(0);
 *
 * The upload path made the opposite mistake: only a rejected fetch counted as
 * retryable, so anything the server actually answered — a 429, a 503, an
 * expired session — was marked permanently failed. The bytes stayed on the
 * device, but nothing tried again, and the save holding that photograph's
 * placeholder stopped with it.
 *
 * Both are the same missing idea: the class of a failure, decided once and
 * named, rather than a boolean guessed at each call site.
 */

const ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const row = {
  entity: "journal" as const,
  entityId: ROW,
  localId: `journal:${ROW}`,
  baseUpdatedAt: "2026-09-19T00:00:00.000Z",
};
const M = "11111111-1111-4111-8111-111111111111";
const payload = { fields: { title: "An entry" }, blocks: [], tagIds: [] };

beforeEach(async () => {
  await dbClearAll();
});

/* ══ 1. classifying what went wrong ════════════════════════ */

test("a rejected fetch is the only thing that means offline", () => {
  const offline = classifyFailure(new TypeError("Failed to fetch"));
  assert.equal(offline.kind, "offline");
  assert.equal(offline.retryable, true);
  assert.equal(offline.offline, true);
});

test("a server that answered is not evidence the network is down", () => {
  for (const status of [429, 503, 408]) {
    const failure = classifyFailure(new UploadError("busy", status, "transfer"));
    assert.equal(failure.retryable, true, String(status));
    assert.equal(failure.offline, false, `${status} is not offline`);
  }
});

test("rate limits and server trouble are temporary, not permanent", () => {
  // The whole of the upload half of this finding: these used to be blocked.
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    assert.equal(classifyFailure(new UploadError("x", status, "transfer")).retryable, true, String(status));
  }
});

test("a refusal the provider meant is permanent", () => {
  for (const status of [400, 404, 413, 415, 422]) {
    const failure = classifyFailure(new UploadError("no", status, "transfer"));
    assert.equal(failure.retryable, false, String(status));
  }
});

test("an expired session keeps the file and says what it needs", () => {
  for (const status of [401, 403]) {
    const failure = classifyFailure(new UploadError("nope", status, "sign"));
    assert.equal(failure.kind, "auth");
    assert.equal(failure.retryable, true, "signing in again fixes it, so the bytes stay");
    assert.match(failure.message, /sign in/i, "and it says so rather than reporting a server error");
  }
});

test("our own timeout is not mistaken for a refusal", () => {
  assert.equal(classifyFailure(new TimeoutError()).kind, "timeout");
  assert.equal(classifyFailure(new TimeoutError()).retryable, true);

  const aborted = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(classifyFailure(aborted).kind, "timeout");
});

test("something unrecognisable is treated as permanent rather than looped on", () => {
  assert.equal(classifyFailure(new Error("who knows")).retryable, false);
});

/* ══ 2. how long to wait ═══════════════════════════════════ */

test("work that finished clears the slate", () => {
  const next = nextAttempt({ failures: 4 }, { kind: "applied" }, { moreWaiting: false });
  assert.equal(next.failures, 0);
  assert.equal(next.delayMs, null, "nothing to schedule");
});

test("more work waiting after a success goes straight away", () => {
  // Not a failure — it is only its turn. This is what keeps a multi-row queue
  // draining promptly.
  const next = nextAttempt({ failures: 0 }, { kind: "applied" }, { moreWaiting: true });
  assert.equal(next.delayMs, 0);
});

test("a 200 carrying a retry outcome does NOT reset the backoff", () => {
  // The reported failure, as one assertion.
  const next = nextAttempt({ failures: 0 }, { kind: "retry-outcome" }, { moreWaiting: true, jitter: 0.5 });
  assert.equal(next.failures, 1, "it counts as a failure, because the work did not happen");
  assert.equal(next.delayMs, BACKOFF_STEPS_MS[0], "and the next attempt waits");
  assert.ok(next.delayMs! > 0, "never zero — that is the tight loop");
});

test("repeated retry outcomes back off further, and stop growing", () => {
  let state = { failures: 0 };
  const delays: number[] = [];
  for (let i = 0; i < 8; i++) {
    const next = nextAttempt(state, { kind: "retry-outcome" }, { moreWaiting: true, jitter: 0.5 });
    state = { failures: next.failures };
    delays.push(next.delayMs!);
  }

  assert.ok(delays[1] > delays[0], "it grows");
  assert.ok(delays.every((delay) => delay <= MAX_BACKOFF_MS), "and is capped");
  assert.equal(delays[delays.length - 1], MAX_BACKOFF_MS, "settling at the ceiling");
});

test("a transport failure is delayed too, never immediate", () => {
  const next = nextAttempt(
    { failures: 0 },
    { kind: "transport", failure: classifyFailure(new TypeError("Failed to fetch")) },
    { moreWaiting: true, jitter: 0.5 }
  );
  assert.ok(next.delayMs! >= 1_000);
});

test("a settled answer schedules nothing on its own", () => {
  const next = nextAttempt({ failures: 2 }, { kind: "settled" }, { moreWaiting: false });
  assert.equal(next.delayMs, null, "a conflict or a refusal is not retried by a timer");
  assert.equal(next.failures, 0);
});

test("jitter spreads the wait without ever reaching zero", () => {
  for (const jitter of [0, 0.25, 0.5, 0.75, 1]) {
    const next = nextAttempt({ failures: 0 }, { kind: "retry-outcome" }, { moreWaiting: true, jitter });
    assert.ok(next.delayMs! >= 1_000, `jitter ${jitter} still waits`);
    assert.ok(next.delayMs! <= BACKOFF_STEPS_MS[0] * 1.2 + 1, `jitter ${jitter} stays near the step`);
  }
});

/* ══ 3. a request that never comes back ════════════════════ */

test("a hung request is given up on instead of owning the queue", async () => {
  const hang = () => new Promise<Response>(() => {});
  await assert.rejects(
    () => fetchWithTimeout("/nowhere", {}, 30, hang as unknown as typeof fetch),
    (error: Error) => error instanceof TimeoutError
  );
});

test("giving up actually cancels the request", async () => {
  let seen: AbortSignal | undefined;
  const hang = ((_url: string, init: RequestInit) => {
    seen = init.signal ?? undefined;
    return new Promise<Response>(() => {});
  }) as unknown as typeof fetch;

  await fetchWithTimeout("/nowhere", {}, 30, hang).catch(() => {});
  assert.equal(seen?.aborted, true, "the connection is not left open behind us");
});

test("a request that answers in time is untouched", async () => {
  const quick = (async () => ({ ok: true, status: 200 })) as unknown as typeof fetch;
  const response = await fetchWithTimeout("/somewhere", {}, 1_000, quick);
  assert.equal(response.status, 200);
});

/* ══ 4. through the real flush ═════════════════════════════ */

/** A server that always answers 200 with a per-mutation "try again". */
function alwaysRetries() {
  let requests = 0;
  const fetchStub = (async (_url: string, init: { body: string }) => {
    requests += 1;
    const { mutations } = JSON.parse(init.body) as { mutations: SyncMutation[] };
    const results: SyncOutcome[] = mutations.map((mutation) => ({
      status: "retry",
      mutationId: mutation.mutationId,
      localId: mutation.localId,
      message: "The studio server is busy.",
    }));
    return { ok: true, status: 200, json: async () => ({ results }) };
  }) as unknown as typeof fetch;
  return { fetchStub, requests: () => requests };
}

test("a server answering 200 with retry does not get hammered", async () => {
  const server = alwaysRetries();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;
  await enqueue({ mutationId: M, ...row, payload });

  await flushOutbox();

  const state = getSyncState();
  assert.equal(server.requests(), 1, "one request, not a loop");
  assert.ok(state.nextRetryAt, "and another attempt is scheduled");
  const wait = Date.parse(state.nextRetryAt!) - Date.now();
  assert.ok(wait > 1_000, `the next attempt waits (${wait}ms), rather than going straight away`);
  assert.equal(state.attempt, 1, "the round trip counted as a failure");
});

test("the work is still queued and still claimable after a retry answer", async () => {
  const server = alwaysRetries();
  (globalThis as { fetch: unknown }).fetch = server.fetchStub;
  await enqueue({ mutationId: M, ...row, payload });

  await flushOutbox();

  const queue = await listQueue();
  assert.equal(queue.length, 1, "nothing was lost");
  assert.equal(queue[0].blocked, undefined, "and it is not permanently refused");
  assert.equal(
    await claimForSending(M, "some-other-tab"),
    true,
    "the claim was handed back, so another tab could carry it"
  );
});

test("a transport failure hands the claim back too", async () => {
  (globalThis as { fetch: unknown }).fetch = (async () => {
    throw new TypeError("Failed to fetch");
  }) as unknown as typeof fetch;
  await enqueue({ mutationId: M, ...row, payload });

  await flushOutbox();

  assert.equal((await listQueue()).length, 1);
  assert.equal(await claimForSending(M, "some-other-tab"), true, "not stranded under a dead claim");
  assert.equal(getSyncState().reachable, false);
});

test("a lapsed session asks to sign in rather than hammering", async () => {
  (globalThis as { fetch: unknown }).fetch = (async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "Sign in again." }),
  })) as unknown as typeof fetch;
  await enqueue({ mutationId: M, ...row, payload });

  await flushOutbox();

  const state = getSyncState();
  assert.equal(state.authRequired, true, "a state the UI can act on");
  assert.equal((await listQueue()).length, 1, "and the writing is still here");
  const wait = Date.parse(state.nextRetryAt ?? "") - Date.now();
  assert.ok(wait > 1_000, "it waits rather than retrying at once");
});

test("everything landing clears the failure count", async () => {
  (globalThis as { fetch: unknown }).fetch = (async (_url: string, init: { body: string }) => {
    const { mutations } = JSON.parse(init.body) as { mutations: SyncMutation[] };
    const results: SyncOutcome[] = mutations.map((mutation) => ({
      status: "saved",
      mutationId: mutation.mutationId,
      localId: mutation.localId,
      id: ROW,
      updatedAt: "2026-09-22T00:00:00.000Z",
      replayed: false,
    }));
    return { ok: true, status: 200, json: async () => ({ results }) };
  }) as unknown as typeof fetch;
  await enqueue({ mutationId: M, ...row, payload });

  await flushOutbox();

  const state = getSyncState();
  assert.equal(state.attempt, 0);
  assert.equal(state.authRequired, false);
  assert.equal(state.nextRetryAt, null, "nothing waiting, nothing scheduled");
  assert.equal((await listQueue()).length, 0);
});

/* ══ 5. waiting for something that is not a failure ════════ */

test("work another tab is carrying is not counted as an attempt", async () => {
  // Nothing has gone wrong: somebody else has it, or a photograph is still
  // going up. Counting those as failures would climb the backoff and show the
  // author an attempt count for a studio that is working perfectly.
  const next = nextAttempt({ failures: 0 }, { kind: "deferred" }, { moreWaiting: true });
  assert.equal(next.failures, 0, "no attempt was made, so none is recorded");
  assert.equal(next.delayMs, DEFERRED_DELAY_MS, "it just looks again shortly");
});

test("a deferred check does not undo a backoff already in progress", async () => {
  const next = nextAttempt({ failures: 3 }, { kind: "deferred" }, { moreWaiting: true });
  assert.equal(next.failures, 3, "the failure count is left exactly as it was");
  assert.ok(next.delayMs! >= DEFERRED_DELAY_MS);
  assert.equal(next.delayMs, BACKOFF_STEPS_MS[2], "and it keeps the longer wait");
});

test("a second tab finding everything claimed waits rather than spinning", async () => {
  let requests = 0;
  (globalThis as { fetch: unknown }).fetch = (async () => {
    requests += 1;
    return { ok: true, status: 200, json: async () => ({ results: [] }) };
  }) as unknown as typeof fetch;

  await enqueue({ mutationId: M, ...row, payload });
  await claimForSending(M, "the-other-tab"); // somebody else is carrying it

  await flushOutbox();

  assert.equal(requests, 0, "it did not send a second copy");
  assert.equal(getSyncState().attempt, 0, "and nothing was recorded as a failure");
  const wait = Date.parse(getSyncState().nextRetryAt ?? "") - Date.now();
  assert.ok(wait > 1_000, "it comes back later instead of looping");
  assert.equal((await listQueue()).length, 1, "the work is untouched");
});
