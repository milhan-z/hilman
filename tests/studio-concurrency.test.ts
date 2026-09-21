import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "pg";

import {
  NO_POSTGRES,
  concurrentDatabase,
  journalData,
  postgresAvailable,
  projectData,
  saveSynced,
  type ConcurrentHarness,
} from "./support/pg-server";

/**
 * Two writers, and what stops them erasing each other.
 *
 * ── the silent overwrite this file exists to end ──
 *
 * save_content_synced decides whether a save is allowed by reading the row's
 * `updated_at` and comparing it to the version the editor says it edited. The
 * read and the write were two separate steps with nothing holding the row
 * between them, so:
 *
 *   T1 reads version V     T2 reads version V
 *   T1 passes the check    T2 passes the check
 *   T1 writes              T2 writes
 *
 * Both are told "saved". One of them is simply gone — no conflict, no warning,
 * and the editor that lost moves its own `synced` snapshot forward, so it will
 * never offer to send that writing again either. The phone's paragraph is
 * overwritten by the laptop and nothing anywhere says so.
 *
 * The second race is the same shape one level up. The idempotency ledger was
 * consulted with a SELECT and written with an INSERT at the very end, so two
 * deliveries of one mutation id could both find nothing, both do the work, and
 * only then argue about the ledger row. The loser's write still happened, and
 * the ledger ends up recording a version the row is no longer at — which
 * poisons every future replay of that id, because the client is handed a base
 * that does not exist and conflicts for ever after.
 *
 * ── why these are not PGlite tests ──
 *
 * PGlite is one embedded backend: one session, one transaction. A second
 * `begin` is a warning, not a second transaction. Neither race above can be
 * expressed on it, and a sequential version of these tests passes against the
 * broken code — which is worse than having no test. So this file wants a real
 * server, and says so out loud when it cannot find one.
 */

const available = postgresAvailable() !== null;
const PROJECT_ROW = { table: "projects", data: projectData } as const;
const JOURNAL_ROW = { table: "journal_posts", data: journalData } as const;

const uuid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

/** Creates a row the studio's own way and returns it at a known version. */
async function seedRow(
  h: ConcurrentHarness,
  entity: "project" | "journal",
  table: string,
  data: Record<string, unknown>
) {
  const client = await h.connect();
  const fn = entity === "project" ? "save_project" : "save_journal_post";
  const { rows } = await client.query<{ id: string }>(
    `select public.${fn}(null, $1::jsonb, '[]'::jsonb, '{}'::uuid[]) as id`,
    [JSON.stringify(data)]
  );
  await client.end();
  return { id: rows[0].id, base: await h.versionOf(table, rows[0].id) };
}

/**
 * Runs two saves that genuinely overlap.
 *
 * T2's call is issued while T1's transaction is still open, so T2 sees the
 * world as it was before T1 — which is exactly the window the check has to
 * survive. The pause is only to let T2 reach whatever it is going to block on
 * before T1 is allowed to commit.
 */
async function overlap<T>(
  first: Client,
  second: Client,
  run: (client: Client) => Promise<T>
): Promise<{ one: T | Error; two: T | Error }> {
  await first.query("begin");
  await second.query("begin");

  const settle = async (promise: Promise<T>) => promise.catch((error: Error) => error);

  const one = await settle(run(first));
  const pending = settle(run(second));
  await new Promise((resolve) => setTimeout(resolve, 250));
  await first.query("commit");
  const two = await pending;
  await second.query("commit").catch(() => second.query("rollback"));

  return { one, two };
}

const statusOf = (outcome: unknown) =>
  outcome instanceof Error ? `error: ${outcome.message}` : (outcome as { status: string }).status;

/* ══ 1. two writers, one version ═══════════════════════════ */

for (const [entity, row] of [
  ["project", PROJECT_ROW],
  ["journal", JOURNAL_ROW],
] as const) {
  test(
    `${entity}: two writers from the same base cannot both win`,
    { skip: available ? false : NO_POSTGRES },
    async () => {
      const h = await concurrentDatabase();
      try {
        const seeded = await seedRow(h, entity, row.table, row.data());
        const phone = await h.connect();
        const laptop = await h.connect();

        const { one, two } = await overlap(phone, laptop, (client) =>
          saveSynced(client, {
            mutationId: client === phone ? uuid(1) : uuid(2),
            entity,
            id: seeded.id,
            base: seeded.base,
            data: row.data({
              title: client === phone ? "PHONE wrote this" : "LAPTOP wrote this",
            }),
          })
        );

        const outcomes = [statusOf(one), statusOf(two)];
        assert.equal(
          outcomes.filter((status) => status === "saved").length,
          1,
          `exactly one save may win — got ${outcomes.join(" and ")}`
        );
        assert.equal(
          outcomes.filter((status) => status === "conflict").length,
          1,
          `and the other must be told it conflicted — got ${outcomes.join(" and ")}`
        );

        // And the stored row is one writer's work, whole — not a blend.
        const check = await h.connect();
        const { rows } = await check.query<{ title: string }>(
          `select title from ${row.table} where id = $1`,
          [seeded.id]
        );
        assert.ok(
          ["PHONE wrote this", "LAPTOP wrote this"].includes(rows[0].title),
          "the surviving row is exactly one of the two saves"
        );
        await check.end();
      } finally {
        await h.close();
      }
    }
  );
}

test(
  "the writer that loses does not leave its blocks behind",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    // save_project deletes and reinserts every block, so a losing writer that
    // got as far as the block replacement would leave the winner's text with
    // the loser's body attached.
    const h = await concurrentDatabase();
    try {
      const seeded = await seedRow(h, "project", "projects", projectData());
      const phone = await h.connect();
      const laptop = await h.connect();

      const blocksFor = (who: string) => [{ type: "paragraph", data: { html: `${who} body` } }];

      const { one, two } = await overlap(phone, laptop, (client) =>
        saveSynced(client, {
          mutationId: client === phone ? uuid(3) : uuid(4),
          entity: "project",
          id: seeded.id,
          base: seeded.base,
          data: projectData({ title: client === phone ? "PHONE" : "LAPTOP" }),
          blocks: blocksFor(client === phone ? "PHONE" : "LAPTOP"),
        })
      );

      const winner = statusOf(one) === "saved" ? "PHONE" : "LAPTOP";
      assert.equal([statusOf(one), statusOf(two)].filter((s) => s === "saved").length, 1);

      const check = await h.connect();
      const { rows } = await check.query<{ data: { html: string } }>(
        "select data from content_blocks where owner_type = 'project' and owner_id = $1 order by position",
        [seeded.id]
      );
      assert.equal(rows.length, 1, "one body, not two writers' worth");
      assert.equal(rows[0].data.html, `${winner} body`, "and it belongs to the writer who won");
      await check.end();
    } finally {
      await h.close();
    }
  }
);

test(
  "edits to different rows still proceed independently",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    // Serializing the same row must not serialize the whole studio.
    const h = await concurrentDatabase();
    try {
      const first = await seedRow(h, "project", "projects", projectData({ slug: "first" }));
      const second = await seedRow(h, "journal", "journal_posts", journalData({ slug: "second" }));

      const a = await h.connect();
      const b = await h.connect();
      await a.query("begin");
      await b.query("begin");

      const ra = await saveSynced(a, {
        mutationId: uuid(5),
        entity: "project",
        id: first.id,
        base: first.base,
        data: projectData({ slug: "first", title: "One" }),
      });
      const rb = await saveSynced(b, {
        mutationId: uuid(6),
        entity: "journal",
        id: second.id,
        base: second.base,
        data: journalData({ slug: "second", title: "Two" }),
      });
      await a.query("commit");
      await b.query("commit");

      assert.equal(ra.status, "saved");
      assert.equal(rb.status, "saved", "a different row is not blocked by the first");
    } finally {
      await h.close();
    }
  }
);

/* ══ 2. one mutation id, one execution ═════════════════════ */

test(
  "the same mutation delivered twice at once only happens once",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    const h = await concurrentDatabase();
    try {
      const seeded = await seedRow(h, "project", "projects", projectData());
      const a = await h.connect();
      const b = await h.connect();
      const same = uuid(7);

      const { one, two } = await overlap(a, b, (client) =>
        saveSynced(client, {
          mutationId: same,
          entity: "project",
          id: seeded.id,
          base: seeded.base,
          data: projectData({ title: "Edited once" }),
        })
      );

      assert.equal(statusOf(one), "saved");
      assert.equal(statusOf(two), "saved", "the duplicate is answered, not refused");
      assert.equal(
        (two as { replayed: boolean }).replayed,
        true,
        "and it is answered as a replay, having done no work of its own"
      );

      // The ledger's recorded version must be the version the row is actually
      // at. When both executed, it recorded the first one's — a version the
      // second had already replaced — and every later replay handed the client
      // a base that does not exist, conflicting for ever.
      const check = await h.connect();
      const { rows: ledger } = await check.query<{ t: string }>(
        "select result_updated_at::text as t from studio_mutations where mutation_id = $1",
        [same]
      );
      const actual = await h.versionOf("projects", seeded.id);
      assert.equal(ledger.length, 1, "one ledger row");
      assert.equal(ledger[0].t, actual, "and it names the version the row is really at");
      await check.end();
    } finally {
      await h.close();
    }
  }
);

test(
  "a concurrent duplicate create does not make two rows",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    // Before the fix both executions ran, and it was only the unique index on
    // `slug` that stopped a second row existing — which turned an ordinary
    // duplicate delivery into a 23505 the sync route classifies as permanent,
    // so a save that had in fact landed was reported to the author as refused.
    const h = await concurrentDatabase();
    try {
      const a = await h.connect();
      const b = await h.connect();
      const same = uuid(8);

      const { one, two } = await overlap(a, b, (client) =>
        saveSynced(client, {
          mutationId: same,
          entity: "project",
          id: null,
          base: null,
          data: projectData({ slug: "created-once", title: "Created once" }),
        })
      );

      assert.equal(statusOf(one), "saved");
      assert.equal(statusOf(two), "saved", "the duplicate is a replay, not a unique-key error");
      assert.equal((one as { id: string }).id, (two as { id: string }).id, "the same row");

      const check = await h.connect();
      const { rows } = await check.query<{ n: number }>(
        "select count(*)::int as n from projects where slug = 'created-once'"
      );
      assert.equal(rows[0].n, 1, "one project, from one mutation id");
      await check.end();
    } finally {
      await h.close();
    }
  }
);

test(
  "a sequential replay is still idempotent and still cheap",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    const h = await concurrentDatabase();
    try {
      const a = await h.connect();
      const same = uuid(9);
      const args = {
        mutationId: same,
        entity: "project" as const,
        id: null,
        base: null,
        data: projectData({ slug: "replayed", title: "Replayed" }),
      };

      const first = await saveSynced(a, args);
      const again = await saveSynced(a, args);

      assert.equal(first.replayed, false);
      assert.equal(again.replayed, true);
      assert.equal(again.id, first.id);
      assert.equal(again.updated_at, first.updated_at, "the same answer, not a new one");
    } finally {
      await h.close();
    }
  }
);

test(
  "the payload-digest refusal from the previous pass still holds",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    // Pass 1's guarantee. Serializing the ledger must not accidentally turn a
    // reused id carrying different writing into a silent replay.
    const h = await concurrentDatabase();
    try {
      const a = await h.connect();
      const same = uuid(1).replace(/^1/, "a");

      await saveSynced(a, {
        mutationId: same,
        entity: "project",
        id: null,
        base: null,
        data: projectData({ slug: "digest", title: "First writing" }),
      });

      await assert.rejects(
        () =>
          saveSynced(a, {
            mutationId: same,
            entity: "project",
            id: null,
            base: null,
            data: projectData({ slug: "digest", title: "Different writing" }),
          }),
        /already used for a different save/
      );
    } finally {
      await h.close();
    }
  }
);

test(
  "a concurrent duplicate carrying different writing is refused, not replayed",
  { skip: available ? false : NO_POSTGRES },
  async () => {
    const h = await concurrentDatabase();
    try {
      const a = await h.connect();
      const b = await h.connect();
      const same = uuid(1).replace(/^1/, "b");

      const { one, two } = await overlap(a, b, (client) =>
        saveSynced(client, {
          mutationId: same,
          entity: "project",
          id: null,
          base: null,
          data: projectData({
            slug: "clash",
            title: client === a ? "A's writing" : "B's writing",
          }),
        })
      );

      assert.equal(statusOf(one), "saved");
      assert.match(
        statusOf(two),
        /already used for a different save/,
        "the second is told plainly rather than handed the first one's result"
      );
    } finally {
      await h.close();
    }
  }
);
