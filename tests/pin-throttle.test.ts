import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "pg";

import {
  NO_POSTGRES,
  concurrentDatabase,
  postgresAvailable,
  type ConcurrentHarness,
} from "./support/pg-server";

/**
 * Counting a wrong PIN, when several arrive at once.
 *
 * ── the lost increments ──
 *
 * The Studio PIN unlocks a real Supabase sign-in, so the count of wrong
 * guesses is the protection on a six-digit secret — a million combinations,
 * which is not many. It was kept like this:
 *
 *     read the counts        (select … where key in (…))
 *     decide in JavaScript   (checkPinBuckets)
 *     write them back        (upsert)
 *
 * Three steps, two round trips, nothing holding anything in between. Two
 * attempts arriving together both read N, both decide N+1, and both write
 * N+1 — two guesses for the price of one. With enough concurrency the limit
 * of five never arrives at all.
 *
 * ── why this is a real-PostgreSQL file ──
 *
 * The failure *is* two callers overlapping. A sequential version of these
 * tests passes against the broken code, which is worse than having no test.
 */

const available = postgresAvailable() !== null;
const skip = available ? false : NO_POSTGRES;

const ADDRESS = "ip:0123456789abcdef";
const GLOBAL = "global";

const buckets = (max = 5, lockoutSeconds = 900) =>
  JSON.stringify([{ key: ADDRESS, max, lockoutSeconds }]);

const bothBuckets = JSON.stringify([
  { key: ADDRESS, max: 5, lockoutSeconds: 900 },
  { key: GLOBAL, max: 20, lockoutSeconds: 900 },
]);

interface Attempt {
  allowed: boolean;
  remaining?: number;
  lockedUntil?: string;
}

const attempt = (client: Client, payload: string) =>
  client
    .query<{ out: Attempt }>("select public.studio_pin_attempt($1::jsonb) as out", [payload])
    .then((r) => r.rows[0].out);

async function countsFor(h: ConcurrentHarness, key: string) {
  const owner = await h.connect();
  try {
    const { rows } = await owner.query<{ failures: number; locked: string | null }>(
      "select failures, locked_until::text as locked from studio_pin_attempts where key = $1",
      [key]
    );
    return rows[0] ?? { failures: 0, locked: null };
  } finally {
    await owner.end();
  }
}

/* ══ 1. every attempt is counted, however they arrive ══════ */

test("five wrong PINs in a row lock the door", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    const results: Attempt[] = [];
    for (let i = 0; i < 5; i++) results.push(await attempt(client, buckets()));

    assert.deepEqual(
      results.map((r) => r.allowed),
      [true, true, true, true, false],
      "the fifth is the one that shuts it"
    );
    assert.ok(results[4].lockedUntil, "and it says until when");
  } finally {
    await h.close();
  }
});

test("the remaining count walks down as it should", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    const remaining: (number | undefined)[] = [];
    for (let i = 0; i < 4; i++) remaining.push((await attempt(client, buckets())).remaining);

    assert.deepEqual(remaining, [4, 3, 2, 1]);
  } finally {
    await h.close();
  }
});

test("ten simultaneous wrong PINs lose none of their increments", { skip }, async () => {
  // The reported failure. Ten separate connections, all counting at once.
  const h = await concurrentDatabase();
  try {
    const clients = await Promise.all(Array.from({ length: 10 }, () => h.connect()));
    const results = await Promise.all(clients.map((c) => attempt(c, buckets())));

    const allowed = results.filter((r) => r.allowed).length;
    assert.equal(allowed, 4, `four get through before the fifth locks it — ${allowed} did`);
    assert.equal(results.filter((r) => !r.allowed).length, 6, "the rest are refused");

    const row = await countsFor(h, ADDRESS);
    assert.ok(row.locked, "the door is shut afterwards");
  } finally {
    await h.close();
  }
});

test("a burst far larger than the limit still only opens it four times", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const clients = await Promise.all(Array.from({ length: 40 }, () => h.connect()));
    const results = await Promise.all(clients.map((c) => attempt(c, buckets())));

    assert.equal(
      results.filter((r) => r.allowed).length,
      4,
      "concurrency is not a way to buy extra guesses"
    );
  } finally {
    await h.close();
  }
});

/* ══ 2. two buckets, counted together ══════════════════════ */

test("a guess is counted against the address and the whole door", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await attempt(client, bothBuckets);

    assert.equal((await countsFor(h, ADDRESS)).failures, 1);
    assert.equal((await countsFor(h, GLOBAL)).failures, 1);
  } finally {
    await h.close();
  }
});

test("the strictest bucket is the one that shuts the door", { skip }, async () => {
  // Five against the address, twenty against the door as a whole.
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    let last: Attempt | null = null;
    for (let i = 0; i < 5; i++) last = await attempt(client, bothBuckets);

    assert.equal(last!.allowed, false, "the address limit arrives first");
    assert.equal((await countsFor(h, GLOBAL)).failures, 5, "the wider count keeps counting");
    assert.equal((await countsFor(h, GLOBAL)).locked, null, "without locking yet");
  } finally {
    await h.close();
  }
});

test("spreading guesses across addresses still trips the whole-door limit", { skip }, async () => {
  // Each guess arrives from a fresh address, so the per-address bucket is
  // always empty. This is the reason the global bucket exists: per-device
  // counting alone is beaten by anyone with more than one device.
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    let last: Attempt | null = null;
    for (let i = 0; i < 20; i++) {
      last = await attempt(
        client,
        JSON.stringify([
          { key: `ip:fresh-${i}`, max: 5, lockoutSeconds: 900 },
          { key: GLOBAL, max: 20, lockoutSeconds: 900 },
        ])
      );
    }

    assert.equal(last!.allowed, false, "the twentieth trips the whole-door limit");
    assert.ok((await countsFor(h, GLOBAL)).locked, "and it is the global bucket that shut");
  } finally {
    await h.close();
  }
});

test("naming the buckets in either order cannot deadlock", { skip }, async () => {
  // They are taken in sorted order inside the function precisely so that two
  // callers listing them differently still queue rather than wait on each
  // other. Without that this test hangs instead of failing.
  const h = await concurrentDatabase();
  try {
    const forwards = JSON.stringify([
      { key: ADDRESS, max: 50, lockoutSeconds: 900 },
      { key: GLOBAL, max: 50, lockoutSeconds: 900 },
    ]);
    const backwards = JSON.stringify([
      { key: GLOBAL, max: 50, lockoutSeconds: 900 },
      { key: ADDRESS, max: 50, lockoutSeconds: 900 },
    ]);

    const clients = await Promise.all(Array.from({ length: 12 }, () => h.connect()));
    await Promise.all(
      clients.map((c, i) => attempt(c, i % 2 === 0 ? forwards : backwards))
    );

    assert.equal((await countsFor(h, ADDRESS)).failures, 12, "all twelve counted");
    assert.equal((await countsFor(h, GLOBAL)).failures, 12);
  } finally {
    await h.close();
  }
});

/* ══ 3. a shut door stays shut ═════════════════════════════ */

test("attempts against a locked bucket are refused without counting", { skip }, async () => {
  // Counting them would let an attacker extend their own lockout for ever,
  // which is a way of locking the owner out rather than a way of stopping a
  // guesser — and the guess was never compared, so it was never a guess.
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    for (let i = 0; i < 5; i++) await attempt(client, buckets());
    const lockedAt = (await countsFor(h, ADDRESS)).locked;

    for (let i = 0; i < 10; i++) {
      const result = await attempt(client, buckets());
      assert.equal(result.allowed, false);
    }

    const after = await countsFor(h, ADDRESS);
    assert.equal(after.failures, 0, "nothing accumulated behind the lock");
    assert.equal(after.locked, lockedAt, "and the lockout was not extended");
  } finally {
    await h.close();
  }
});

test("a lockout that has run out starts the window again", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    // A lockout measured in seconds, then moved into the past directly.
    for (let i = 0; i < 5; i++) await attempt(client, buckets(5, 900));
    const owner = await h.connect();
    await owner.query(
      "update studio_pin_attempts set locked_until = now() - interval '1 minute' where key = $1",
      [ADDRESS]
    );

    const next = await attempt(client, buckets());
    assert.equal(next.allowed, true, "the door opens again");
    assert.equal(next.remaining, 4, "with a full window, not the tail of the old one");
  } finally {
    await h.close();
  }
});

/* ══ 4. a correct PIN forgets the wrong ones ═══════════════ */

test("clearing resets only the buckets it was given", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await attempt(client, bothBuckets);
    await attempt(client, bothBuckets);

    await client.query("select public.studio_pin_clear($1::text[])", [[ADDRESS]]);

    assert.equal((await countsFor(h, ADDRESS)).failures, 0, "this one is forgiven");
    assert.equal((await countsFor(h, GLOBAL)).failures, 2, "and unrelated protection survives");
  } finally {
    await h.close();
  }
});

test("clearing a locked bucket opens it", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    for (let i = 0; i < 5; i++) await attempt(client, buckets());
    await client.query("select public.studio_pin_clear($1::text[])", [[ADDRESS, GLOBAL]]);

    const after = await countsFor(h, ADDRESS);
    assert.equal(after.locked, null);
    assert.equal((await attempt(client, buckets())).allowed, true);
  } finally {
    await h.close();
  }
});

test("clearing nothing is not an error", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await client.query("select public.studio_pin_clear($1::text[])", [[]]);
    await client.query("select public.studio_pin_clear(null::text[])");
  } finally {
    await h.close();
  }
});

/* ══ 5. the counter is not something a guesser can touch ═══ */

test("an anonymous caller cannot count, clear or read attempts", { skip }, async () => {
  // A limiter the guesser can reset is not a limiter.
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();

    await assert.rejects(() => attempt(anon, buckets()), /permission denied/i);
    await assert.rejects(
      () => anon.query("select public.studio_pin_clear($1::text[])", [[ADDRESS]]),
      /permission denied/i
    );
    const { rows } = await anon.query("select * from studio_pin_attempts");
    assert.equal(rows.length, 0, "RLS is on with no policies at all");
  } finally {
    await h.close();
  }
});

test("a signed-in visitor cannot either", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await client.query("set role authenticated");
    await assert.rejects(() => attempt(client, buckets()), /permission denied/i);
  } finally {
    await h.close();
  }
});

test("a malformed bucket list is refused rather than ignored", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await assert.rejects(() => attempt(client, "[]"), /at least one bucket/i);
    await assert.rejects(() => attempt(client, '{"key":"x"}'), /at least one bucket/i);
    await assert.rejects(() => attempt(client, '[{"max":5}]'), /needs a key/i);
  } finally {
    await h.close();
  }
});

/* ══ 6. the state this replaces ════════════════════════════ */

test("the database before this migration had no way to count atomically", { skip }, async () => {
  const h = await concurrentDatabase(10);
  try {
    const client = await h.connect();
    await assert.rejects(
      () => attempt(client, buckets()),
      /function public.studio_pin_attempt|does not exist/i,
      "the counting was all in JavaScript"
    );
  } finally {
    await h.close();
  }
});

test("applying the migration to that database gives it one", { skip }, async () => {
  const h = await concurrentDatabase(10);
  try {
    await h.apply(11);
    const clients = await Promise.all(Array.from({ length: 10 }, () => h.connect()));
    const results = await Promise.all(clients.map((c) => attempt(c, buckets())));

    assert.equal(results.filter((r) => r.allowed).length, 4, "the upgrade path, not just a fresh one");
  } finally {
    await h.close();
  }
});
