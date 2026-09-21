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
 * The contact form's limit, against a clock the sender does not own.
 *
 * ── the two ways past it ──
 *
 * 1. `messages.created_at` is `not null default now()`, and a default is an
 *    offer rather than a rule. The insert policy never mentioned the column,
 *    so an anonymous caller holding the public anon key could supply one:
 *
 *        insert into messages (name, email, body, created_at)
 *        values ('A', 'spam@x.test', 'hello', now() - interval '2 hours');
 *
 *    The limiter counts rows `where created_at > now() - interval '1 hour'`.
 *    Rows stamped two hours ago never count, so backdating every insert kept
 *    the window permanently empty. Measured before the fix: 50 accepted from
 *    one address against a limit of 3, and 133 rows in an hour that allows 30.
 *
 * 2. The trigger counts, and then the row is written. Two transactions cannot
 *    see each other's uncommitted rows, so concurrent inserts all counted the
 *    same world and all decided they were inside the limit. Measured before
 *    the fix: ten simultaneous inserts from one address, limit 3, ten stored.
 *
 * ── why these are not PGlite tests ──
 *
 * The second one cannot be written on a single embedded backend — the whole
 * failure is two transactions open at once — and a sequential version passes
 * against the broken code. These connect as the real `anon` role so RLS
 * genuinely applies; connected as the superuser every policy is bypassed and
 * the test would be measuring nothing.
 */

const available = postgresAvailable() !== null;
const skip = available ? false : NO_POSTGRES;

const PER_SENDER = 3;
const PER_HOUR = 30;

/** No RETURNING anywhere: anon may insert a message but may not read one. */
function send(client: Client, email: string, createdAt?: string) {
  return createdAt === undefined
    ? client.query("insert into messages (name, email, body) values ($1, $2, $3)", [
        "A visitor",
        email,
        "Hello there.",
      ])
    : client.query(
        "insert into messages (name, email, body, created_at) values ($1, $2, $3, $4::timestamptz)",
        ["A visitor", email, "Hello there.", createdAt]
      );
}

const twoHoursAgo = () => new Date(Date.now() - 2 * 3_600_000).toISOString();

async function countFor(h: ConcurrentHarness, email: string): Promise<number> {
  const owner = await h.connect();
  try {
    const { rows } = await owner.query<{ n: number }>(
      "select count(*)::int as n from messages where lower(email) = lower($1)",
      [email]
    );
    return rows[0].n;
  } finally {
    await owner.end();
  }
}

/** How many of a burst were accepted, sending each one until one is refused. */
async function sendUntilRefused(client: Client, email: string, attempts: number, createdAt?: string) {
  let accepted = 0;
  for (let i = 0; i < attempts; i++) {
    try {
      await send(client, email, createdAt);
      accepted += 1;
    } catch {
      break;
    }
  }
  return accepted;
}

/* ══ 1. the limit still works for an honest sender ═════════ */

test("an ordinary sender is allowed three messages an hour", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    const accepted = await sendUntilRefused(anon, "honest@x.test", 10);

    assert.equal(accepted, PER_SENDER);
    assert.equal(await countFor(h, "honest@x.test"), PER_SENDER);
  } finally {
    await h.close();
  }
});

test("a single legitimate message goes through untouched", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await send(anon, "someone@x.test");

    const owner = await h.connect();
    const { rows } = await owner.query<{ name: string; body: string; status: string }>(
      "select name, body, status from messages where email = 'someone@x.test'"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "A visitor");
    assert.equal(rows[0].body, "Hello there.");
    assert.equal(rows[0].status, "new");
  } finally {
    await h.close();
  }
});

/* ══ 2. the sender does not get to choose the time ═════════ */

test("a backdated message is stored at the time it actually arrived", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await send(anon, "backdated@x.test", twoHoursAgo());

    const owner = await h.connect();
    const { rows } = await owner.query<{ age: number }>(
      "select extract(epoch from (now() - created_at))::int as age from messages where email = 'backdated@x.test'"
    );
    assert.equal(rows.length, 1);
    assert.ok(
      rows[0].age < 60,
      `stored as ${rows[0].age}s old — the caller's two-hour-old timestamp was kept`
    );
  } finally {
    await h.close();
  }
});

test("backdating every message does not lift the per-sender limit", { skip }, async () => {
  // The reported bypass, exactly: 50 accepted against a limit of 3.
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    const accepted = await sendUntilRefused(anon, "spam@x.test", 50, twoHoursAgo());

    assert.equal(accepted, PER_SENDER, "the backdated flood is stopped at the ordinary limit");
    assert.equal(await countFor(h, "spam@x.test"), PER_SENDER);
  } finally {
    await h.close();
  }
});

test("backdating does not lift the whole-inbox limit either", { skip }, async () => {
  // Spread across distinct addresses, so only the global ceiling applies.
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    let accepted = 0;
    for (let i = 0; i < PER_HOUR + 20; i++) {
      try {
        await send(anon, `n${i}@x.test`, twoHoursAgo());
        accepted += 1;
      } catch {
        break;
      }
    }

    assert.equal(accepted, PER_HOUR, `accepted ${accepted} against a ceiling of ${PER_HOUR}`);

    const owner = await h.connect();
    const { rows } = await owner.query<{ n: number }>("select count(*)::int as n from messages");
    assert.equal(rows[0].n, PER_HOUR, "133 rows in an hour that allows 30 was the finding");
  } finally {
    await h.close();
  }
});

test("a message dated in the future is not trusted either", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const accepted = await sendUntilRefused(anon, "future@x.test", 10, future);

    assert.equal(accepted, PER_SENDER, "the clock is ours in both directions");
  } finally {
    await h.close();
  }
});

/* ══ 3. arriving all at once is not a way through ══════════ */

/** Opens `n` anonymous connections and has each one begin a transaction. */
async function burst(h: ConcurrentHarness, n: number) {
  const callers = await Promise.all(
    Array.from({ length: n }, async () => {
      const client = await h.connectAsAnon();
      await client.query("begin");
      return client;
    })
  );
  return callers;
}

/**
 * Each caller finishes its own transaction as soon as its insert settles.
 *
 * Deliberately not "all insert, then all commit". The limiter now takes a
 * transaction-scoped advisory lock, so a caller holding a transaction open
 * after inserting would block every other sender until it ended — and a test
 * that made all forty do that would deadlock on its own harness rather than
 * measure anything. Nothing in production holds a message insert open like
 * that: PostgREST runs each one as a single auto-committing statement.
 *
 * The transactions still all *begin* before any of them inserts, which is the
 * part that matters: none can see another's rows when the trigger counts, and
 * that is exactly the world in which ten of them used to get through.
 */
async function settle(callers: Client[], run: (c: Client) => Promise<unknown>) {
  return Promise.all(
    callers.map(async (client) => {
      try {
        await run(client);
        await client.query("commit");
        return "accepted" as const;
      } catch (error) {
        await client.query("rollback").catch(() => {});
        return (error as Error).message;
      }
    })
  );
}

test("ten simultaneous messages from one address still stop at three", { skip }, async () => {
  // Every one of these transactions is open before any of them inserts, so
  // none can see the others' rows. That is the whole failure: they all counted
  // an empty hour and all decided they were within the limit.
  const h = await concurrentDatabase();
  try {
    const callers = await burst(h, 10);
    const results = await settle(callers, (c) => send(c, "burst@x.test"));

    const accepted = results.filter((r) => r === "accepted").length;
    assert.equal(accepted, PER_SENDER, `accepted ${accepted} of 10 against a limit of ${PER_SENDER}`);
    assert.equal(await countFor(h, "burst@x.test"), PER_SENDER);
  } finally {
    await h.close();
  }
});

test("a simultaneous flood from many addresses stops at the inbox ceiling", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const callers = await burst(h, 40);
    const results = await settle(callers, (c) =>
      send(c, `burst-${Math.random().toString(36).slice(2, 10)}@x.test`)
    );

    const accepted = results.filter((r) => r === "accepted").length;
    assert.equal(accepted, PER_HOUR, `accepted ${accepted} of 40 against a ceiling of ${PER_HOUR}`);

    const owner = await h.connect();
    const { rows } = await owner.query<{ n: number }>("select count(*)::int as n from messages");
    assert.equal(rows[0].n, PER_HOUR);
  } finally {
    await h.close();
  }
});

test("a refused message says why, in the studio's own words", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await sendUntilRefused(anon, "wordy@x.test", PER_SENDER);

    await assert.rejects(
      () => send(anon, "wordy@x.test"),
      /Too many messages from this address/,
      "the sender is told what happened, not given a stack trace"
    );
  } finally {
    await h.close();
  }
});

/* ══ 4. the owner is unaffected ════════════════════════════ */

test("the owner can still read and clear the inbox", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await send(anon, "reader@x.test");

    const owner = await h.connect();
    const { rows } = await owner.query<{ n: number }>("select count(*)::int as n from messages");
    assert.equal(rows[0].n, 1, "the owner sees it");

    await owner.query("update messages set status = 'actioned', handled_at = now()");
    await owner.query("delete from messages where email = 'reader@x.test'");
    const after = await owner.query<{ n: number }>("select count(*)::int as n from messages");
    assert.equal(after.rows[0].n, 0, "and can clear it");
  } finally {
    await h.close();
  }
});

test("an anonymous caller still cannot read the inbox", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await send(anon, "nosy@x.test");

    const { rows } = await anon.query("select * from messages");
    assert.equal(rows.length, 0, "the insert policy is not a read policy");
  } finally {
    await h.close();
  }
});

test("an anonymous caller cannot mark its own message handled", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const anon = await h.connectAsAnon();
    await assert.rejects(
      () =>
        anon.query(
          "insert into messages (name, email, body, status) values ('A','sneaky@x.test','hi','actioned')"
        ),
      /row-level security/i
    );
  } finally {
    await h.close();
  }
});

/* ══ 5. the upgrade path ═══════════════════════════════════ */

test("the database before this migration really was bypassable", { skip }, async () => {
  // Kept so the fix cannot be quietly reverted into a no-op: this is the
  // behaviour that shipped, and it is what the migration above changes.
  const h = await concurrentDatabase(9);
  try {
    const anon = await h.connectAsAnon();
    const accepted = await sendUntilRefused(anon, "old@x.test", 20, twoHoursAgo());

    assert.ok(
      accepted > PER_SENDER,
      `expected the old limiter to be walked past; it accepted ${accepted}`
    );
  } finally {
    await h.close();
  }
});

test("applying the migration to that database closes it", { skip }, async () => {
  const h = await concurrentDatabase(9);
  try {
    const anon = await h.connectAsAnon();
    assert.ok((await sendUntilRefused(anon, "old@x.test", 20, twoHoursAgo())) > PER_SENDER);

    const owner = await h.connect();
    await owner.query("delete from messages");
    await h.apply(10);

    const accepted = await sendUntilRefused(anon, "old@x.test", 20, twoHoursAgo());
    assert.equal(accepted, PER_SENDER, "the upgrade path, not just a fresh install");
  } finally {
    await h.close();
  }
});
