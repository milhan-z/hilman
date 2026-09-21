import assert from "node:assert/strict";
import test from "node:test";
import type { Client } from "pg";

import {
  NO_POSTGRES,
  concurrentDatabase,
  journalData,
  postgresAvailable,
  projectData,
  type ConcurrentHarness,
} from "./support/pg-server";

/**
 * Deleting an article, and its body, together or not at all.
 *
 * ── the partial delete ──
 *
 * The server action issued two statements, in two round trips, and looked at
 * neither result:
 *
 *     delete from content_blocks where owner_type = … and owner_id = …
 *     delete from projects where id = …
 *
 * If the first succeeded and the second did not — a constraint, a dropped
 * connection, anything at all — the article stayed on the public site with its
 * entire body removed, and the studio redirected as though it had worked.
 * Reproduced here: a published project with twenty blocks, one failure, and
 * afterwards the project is still there and every block is gone.
 *
 * `content_blocks` is why this cannot be left to the schema. Tags cascade,
 * because `project_tags` and `journal_tags` have real foreign keys. Blocks are
 * polymorphic — `owner_type` plus `owner_id`, nothing to hang a cascade on —
 * so somebody has to delete them deliberately, and "somebody" was two
 * unchecked statements in application code.
 */

const available = postgresAvailable() !== null;
const skip = available ? false : NO_POSTGRES;

const paragraphs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ type: "paragraph", data: { text: `Paragraph ${i + 1}` } }));

async function seed(
  client: Client,
  entity: "project" | "journal",
  blocks = 20,
  extra: Record<string, unknown> = {}
) {
  const fn = entity === "project" ? "save_project" : "save_journal_post";
  const data = entity === "project" ? projectData(extra) : journalData(extra);
  const { rows } = await client.query<{ id: string }>(
    `select public.${fn}(null, $1::jsonb, $2::jsonb, '{}'::uuid[]) as id`,
    [JSON.stringify(data), JSON.stringify(paragraphs(blocks))]
  );
  return rows[0].id;
}

async function census(client: Client, entity: "project" | "journal", id: string) {
  const table = entity === "project" ? "projects" : "journal_posts";
  const [row, blocks] = await Promise.all([
    client.query<{ n: number }>(`select count(*)::int as n from ${table} where id = $1`, [id]),
    client.query<{ n: number }>(
      "select count(*)::int as n from content_blocks where owner_type = $1 and owner_id = $2",
      [entity, id]
    ),
  ]);
  return { row: row.rows[0].n, blocks: blocks.rows[0].n };
}

const remove = (client: Client, entity: "project" | "journal", id: string) =>
  client.query("select public.delete_content($1, $2::uuid) as out", [entity, id]);

/* ══ 1. the reported failure, on the old path ══════════════ */

for (const entity of ["project", "journal"] as const) {
  const table = entity === "project" ? "projects" : "journal_posts";

  test(`${entity}: the old two-statement delete could strip the body and leave the row`, { skip }, async () => {
    const h = await concurrentDatabase();
    try {
      const client = await h.connect();
      const id = await seed(client, entity);
      assert.deepEqual(await census(client, entity, id), { row: 1, blocks: 20 });

      // One internal operation fails. Exactly what the action used to do.
      await client.query(
        `create or replace function _boom() returns trigger language plpgsql as $$
           begin raise exception 'something went wrong'; end $$`
      );
      await client.query(
        `create trigger _boom_trg before delete on ${table} for each row execute function _boom()`
      );

      await client.query(
        "delete from content_blocks where owner_type = $1 and owner_id = $2",
        [entity, id]
      );
      await assert.rejects(() => client.query(`delete from ${table} where id = $1`, [id]));

      assert.deepEqual(
        await census(client, entity, id),
        { row: 1, blocks: 0 },
        "the article survives with its body removed"
      );
    } finally {
      await h.close();
    }
  });

  test(`${entity}: a failure part-way through the new delete changes nothing`, { skip }, async () => {
    const h = await concurrentDatabase();
    try {
      const client = await h.connect();
      const id = await seed(client, entity);

      await client.query(
        `create or replace function _boom() returns trigger language plpgsql as $$
           begin raise exception 'something went wrong'; end $$`
      );
      await client.query(
        `create trigger _boom_trg before delete on ${table} for each row execute function _boom()`
      );

      await assert.rejects(() => remove(client, entity, id), /something went wrong/);

      assert.deepEqual(
        await census(client, entity, id),
        { row: 1, blocks: 20 },
        "all of it survives, which is the other acceptable outcome"
      );
    } finally {
      await h.close();
    }
  });

  test(`${entity}: a successful delete takes the row, the blocks and the tags`, { skip }, async () => {
    const h = await concurrentDatabase();
    try {
      const client = await h.connect();
      const { rows: tag } = await client.query<{ id: string }>(
        "insert into tags (slug, name) values ('t', 'A tag') returning id"
      );
      const id = await seed(client, entity);
      const join = entity === "project" ? "project_tags" : "journal_tags";
      const column = entity === "project" ? "project_id" : "journal_id";
      await client.query(`insert into ${join} (${column}, tag_id) values ($1, $2)`, [id, tag[0].id]);

      await remove(client, entity, id);

      assert.deepEqual(await census(client, entity, id), { row: 0, blocks: 0 });
      const { rows } = await client.query<{ n: number }>(
        `select count(*)::int as n from ${join} where ${column} = $1`,
        [id]
      );
      assert.equal(rows[0].n, 0, "the tag join went with it");
      const stillThere = await client.query<{ n: number }>("select count(*)::int as n from tags");
      assert.equal(stillThere.rows[0].n, 1, "but the tag itself is not content");
    } finally {
      await h.close();
    }
  });

  test(`${entity}: deleting one article leaves another alone`, { skip }, async () => {
    const h = await concurrentDatabase();
    try {
      const client = await h.connect();
      const doomed = await seed(client, entity, 5, { slug: "doomed" });
      const keeper = await seed(client, entity, 7, { slug: "keeper" });

      await remove(client, entity, doomed);

      assert.deepEqual(await census(client, entity, doomed), { row: 0, blocks: 0 });
      assert.deepEqual(await census(client, entity, keeper), { row: 1, blocks: 7 });
    } finally {
      await h.close();
    }
  });
}

/* ══ 2. who may delete ═════════════════════════════════════ */

test("a visitor cannot delete anything", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const owner = await h.connect();
    const id = await seed(owner, "project");

    const anon = await h.connectAsAnon();
    await assert.rejects(() => remove(anon, "project", id), /permission denied/i);

    assert.deepEqual(await census(owner, "project", id), { row: 1, blocks: 20 });
  } finally {
    await h.close();
  }
});

test("a signed-in account that is not the owner cannot either", { skip }, async () => {
  // The database decides, not the calling code. A server action that forgot to
  // guard would still be refused here.
  const h = await concurrentDatabase();
  try {
    const owner = await h.connect();
    const id = await seed(owner, "project");

    const stranger = await h.connect();
    await stranger.query("select set_config('test.user_id', gen_random_uuid()::text, false)");
    await stranger.query("set role authenticated");

    await assert.rejects(() => remove(stranger, "project", id), /Not authorized/i);
    assert.deepEqual(await census(owner, "project", id), { row: 1, blocks: 20 });
  } finally {
    await h.close();
  }
});

/* ══ 3. saying what it cannot do ═══════════════════════════ */

test("deleting something that is already gone says so", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await assert.rejects(
      () => remove(client, "project", "00000000-0000-4000-8000-000000000000"),
      /no longer exists/i
    );
  } finally {
    await h.close();
  }
});

test("an unknown kind of content is refused", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    await assert.rejects(
      () =>
        client.query("select public.delete_content('page', $1::uuid)", [
          "00000000-0000-4000-8000-000000000000",
        ]),
      /Unknown content kind/i
    );
    await assert.rejects(
      () => client.query("select public.delete_content('project', null::uuid)"),
      /Nothing was named/i
    );
  } finally {
    await h.close();
  }
});

test("it reports what it removed", { skip }, async () => {
  const h = await concurrentDatabase();
  try {
    const client = await h.connect();
    const id = await seed(client, "journal", 4);
    const { rows } = await client.query<{ out: { deleted: boolean; blocks: number; title: string } }>(
      "select public.delete_content('journal', $1::uuid) as out",
      [id]
    );

    assert.equal(rows[0].out.deleted, true);
    assert.equal(rows[0].out.blocks, 4);
    assert.equal(rows[0].out.title, "An entry");
  } finally {
    await h.close();
  }
});

/* ══ 4. a save arriving while a delete is in flight ════════ */

test("a save cannot leave blocks behind a delete", { skip }, async () => {
  // The delete takes the article's row first, so a save landing in the middle
  // waits rather than reinserting blocks for a row that is about to go. That
  // is the whole reason for the `for update` at the top of delete_content.
  const h = await concurrentDatabase();
  try {
    const owner = await h.connect();
    const id = await seed(owner, "project", 3);

    const deleter = await h.connect();
    const saver = await h.connect();
    await deleter.query("begin");
    await remove(deleter, "project", id);

    // Starts while the delete is uncommitted, and blocks on the locked row.
    const pending = saver
      .query("select public.save_project($1::uuid, $2::jsonb, $3::jsonb, '{}'::uuid[])", [
        id,
        JSON.stringify(projectData({ title: "Edited during a delete" })),
        JSON.stringify(paragraphs(9)),
      ])
      .then(() => "saved" as const)
      .catch((error: Error) => error.message);

    await new Promise((resolve) => setTimeout(resolve, 250));
    await deleter.query("commit");
    const outcome = await pending;

    assert.match(String(outcome), /no longer exists/i, "the save is told the row went");
    const { rows } = await owner.query<{ n: number }>(
      "select count(*)::int as n from content_blocks where owner_id = $1",
      [id]
    );
    assert.equal(rows[0].n, 0, "and left no orphaned blocks behind");
  } finally {
    await h.close();
  }
});

/* ══ 5. the upgrade path ═══════════════════════════════════ */

test("the function does not exist before its migration", { skip }, async () => {
  const h = await concurrentDatabase(11);
  try {
    const client = await h.connect();
    await assert.rejects(
      () => remove(client, "project", "00000000-0000-4000-8000-000000000000"),
      /does not exist/i
    );
  } finally {
    await h.close();
  }
});

test("applying the migration to that database gives it one", { skip }, async () => {
  const h = await concurrentDatabase(11);
  try {
    const client = await h.connect();
    const id = await seed(client, "project", 6);
    await h.apply(12);

    await remove(client, "project", id);
    assert.deepEqual(await census(client, "project", id), { row: 0, blocks: 0 });
  } finally {
    await h.close();
  }
});
