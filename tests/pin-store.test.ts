import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  GLOBAL_KEY,
  addressFromHeaders,
  attemptKeyForAddress,
  clearPinAttempts,
  reservePinAttempt,
} from "../lib/studio-pin-store";

/**
 * What the studio does when it cannot count.
 *
 * The counting itself is the database's now — `studio_pin_attempt`, exercised
 * against a real PostgreSQL with real concurrency in tests/pin-throttle.test.ts.
 * What is left here is the part that used to be wrong in a quieter way:
 *
 *     if (error) {
 *       console.error(…);
 *       return { durable: false, attempts: memory.get(key) ?? NO_ATTEMPTS };
 *     }
 *
 * An unreachable table fell back to a per-process Map and carried on, and the
 * caller only logged a warning about it. On Vercel that is not a rate limit at
 * all — every instance has its own copy and a cold start wipes it — so the
 * protection on a six-digit secret quietly evaporated at exactly the moment
 * the database was having trouble.
 *
 * A limiter that cannot count must refuse, not guess.
 */

/** A Supabase stand-in that records what it was asked and answers as told. */
function fakeSupabase(answer: { data?: unknown; error?: { message: string } }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

const BUCKETS = [
  { key: "ip:abc", max: 5, lockoutMs: 900_000 },
  { key: GLOBAL_KEY, max: 20, lockoutMs: 900_000 },
];

/* ══ 1. it refuses rather than guessing ════════════════════ */

test("no durable counter means no PIN sign-in", async () => {
  // Previously: fall back to an in-process Map and carry on.
  const reservation = await reservePinAttempt(BUCKETS, null);

  assert.equal(reservation.status, "unavailable");
  if (reservation.status !== "unavailable") return;
  assert.match(reservation.message, /email and password/i, "and it says how to get in instead");
});

test("a counter that errors means no PIN sign-in", async () => {
  const { client } = fakeSupabase({ error: { message: "connection refused" } });
  const reservation = await reservePinAttempt(BUCKETS, client);

  assert.equal(reservation.status, "unavailable");
});

test("an answer that makes no sense is treated as no answer", async () => {
  for (const data of [null, {}, { allowed: "yes" }, "ok", 7]) {
    const { client } = fakeSupabase({ data });
    const reservation = await reservePinAttempt(BUCKETS, client);
    assert.equal(reservation.status, "unavailable", JSON.stringify(data));
  }
});

test("the refusal never says whether the PIN was right", async () => {
  // It is decided before any comparison, so it cannot — but the message is
  // the thing a guesser reads, and it should be about the counter, not the
  // secret or whether an account exists.
  const reservation = await reservePinAttempt(BUCKETS, null);
  if (reservation.status !== "unavailable") return assert.fail("expected unavailable");

  assert.ok(!/pin is|correct|wrong|account/i.test(reservation.message), reservation.message);
});

/* ══ 2. it passes the database's answer through honestly ═══ */

test("an allowed attempt reports how many tries are left", async () => {
  const { client } = fakeSupabase({ data: { allowed: true, remaining: 3 } });
  const reservation = await reservePinAttempt(BUCKETS, client);

  assert.deepEqual(reservation, { status: "allowed", remaining: 3 });
});

test("a locked door reports when it opens again", async () => {
  const at = "2026-09-22T10:30:00.000Z";
  const { client } = fakeSupabase({ data: { allowed: false, lockedUntil: at } });
  const reservation = await reservePinAttempt(BUCKETS, client);

  assert.equal(reservation.status, "locked");
  if (reservation.status !== "locked") return;
  assert.equal(reservation.lockedUntil, Date.parse(at));
});

test("a lock with an unreadable time is still a lock", async () => {
  const { client } = fakeSupabase({ data: { allowed: false, lockedUntil: "not a date" } });
  const reservation = await reservePinAttempt(BUCKETS, client);

  assert.equal(reservation.status, "locked", "never fall open because a timestamp was odd");
});

/* ══ 3. what it actually asks for ══════════════════════════ */

test("both buckets are counted in one call, in seconds", async () => {
  const { client, calls } = fakeSupabase({ data: { allowed: true, remaining: 4 } });
  await reservePinAttempt(BUCKETS, client);

  assert.equal(calls.length, 1, "one round trip — the whole point of the RPC");
  assert.equal(calls[0].fn, "studio_pin_attempt");
  assert.deepEqual(calls[0].args.p_buckets, [
    { key: "ip:abc", max: 5, lockoutSeconds: 900 },
    { key: GLOBAL_KEY, max: 20, lockoutSeconds: 900 },
  ]);
});

test("clearing names the buckets it forgives", async () => {
  const { client, calls } = fakeSupabase({ data: null });
  await clearPinAttempts(["ip:abc", GLOBAL_KEY], client);

  assert.equal(calls[0].fn, "studio_pin_clear");
  assert.deepEqual(calls[0].args.p_keys, ["ip:abc", GLOBAL_KEY]);
});

test("clearing nothing, or with no counter, does nothing", async () => {
  const { client, calls } = fakeSupabase({ data: null });
  await clearPinAttempts([], client);
  await clearPinAttempts(["ip:abc"], null);

  assert.equal(calls.length, 0);
});

test("a failed clear is not worth refusing a correct PIN over", async () => {
  // The owner is already through the door and the counters expire anyway.
  const { client } = fakeSupabase({ error: { message: "connection refused" } });
  await assert.doesNotReject(() => clearPinAttempts(["ip:abc"], client));
});

/* ══ 4. who is knocking ════════════════════════════════════ */

test("an address becomes a hash, not a visitor log", async () => {
  const key = attemptKeyForAddress("203.0.113.7");

  assert.match(key, /^ip:[0-9a-f]{32}$/);
  assert.ok(!key.includes("203.0.113.7"), "the address itself is not stored");
  assert.equal(key, attemptKeyForAddress("203.0.113.7"), "and it is stable");
  assert.notEqual(key, attemptKeyForAddress("203.0.113.8"));
});

test("no address at all still gets a bucket", async () => {
  for (const missing of [null, undefined, "", "   "]) {
    assert.equal(attemptKeyForAddress(missing), "unknown-address");
  }
});

test("the client is the leftmost forwarded address", async () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
  assert.equal(addressFromHeaders(headers), "203.0.113.7");

  assert.equal(addressFromHeaders(new Headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
  assert.equal(addressFromHeaders(new Headers()), null);
});
