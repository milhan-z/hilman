import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  closeSharedDatabases,
  freshDatabase,
  latestMigration,
  sharedDatabase,
  withRollback,
  type Harness,
} from "./support/pg";

/**
 * How many people have read an entry — migration 0013, run for real.
 *
 * The count is the one number on the public site a visitor can move, so what
 * matters is what they *cannot* do with it: write the table, count a draft, or
 * set the number to anything but itself plus one. And one thing the author
 * must never notice: a visit moving the version the Studio saves against.
 */

const LATEST = latestMigration();

async function saveProject(h: Harness, data: Record<string, unknown>, id: string | null = null) {
  const [row] = await h.query<{ id: string }>(
    "select public.save_project($1::uuid, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as id",
    [id, JSON.stringify({ title: "A piece", stream: "visual-design", status: "draft", ...data })]
  );
  return row.id;
}

async function saveJournal(h: Harness, data: Record<string, unknown>) {
  const [row] = await h.query<{ id: string }>(
    "select public.save_journal_post(null, $1::jsonb, '[]'::jsonb, '{}'::uuid[]) as id",
    [JSON.stringify({ title: "An entry", status: "draft", reading_minutes: "2", ...data })]
  );
  return row.id;
}

const read = async (h: Harness, kind: string, id: string) => {
  const [row] = await h.query<{ reads: string | null }>(
    "select public.record_read($1, $2::uuid)::text as reads",
    [kind, id]
  );
  return row.reads === null ? null : Number(row.reads);
};

const countOf = async (h: Harness, kind: string, id: string) => {
  const rows = await h.query<{ reads: string }>(
    "select reads::text as reads from content_reads where owner_type = $1 and owner_id = $2",
    [kind, id]
  );
  return rows.length ? Number(rows[0].reads) : null;
};

/**
 * What Supabase does at bootstrap and PGlite does not: give the API roles
 * table privileges and leave RLS to decide. Without it `set role anon` would
 * be refused by permissions before a single policy was consulted, and every
 * assertion below about policies would be testing the wrong layer.
 */
async function asVisitor<T>(h: Harness, body: () => Promise<T>): Promise<T> {
  await h.db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
    set role anon;
  `);
  try {
    return await body();
  } finally {
    await h.db.exec("reset role");
  }
}

/**
 * Asserts a statement is refused, without taking the test's transaction down
 * with it: an error inside `begin` aborts everything after it, so each
 * expected refusal gets a savepoint of its own to roll back to.
 */
async function refused(h: Harness, sql: string, params: unknown[], pattern: RegExp) {
  await h.db.exec("savepoint refused");
  try {
    await assert.rejects(h.query(sql, params), pattern);
  } finally {
    await h.db.exec("rollback to savepoint refused");
  }
}

after(closeSharedDatabases);

/* ══ 1. installing it ═════════════════════════════════════ */

test("0013 applies over an existing installation, and again without complaint", async () => {
  const h = await freshDatabase(12);
  try {
    await h.apply(13);
    await h.apply(13);
    const [table] = await h.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_name = 'content_reads'"
    );
    assert.equal(table.n, 1);
  } finally {
    await h.close();
  }
});

/* ══ 2. what counts ═══════════════════════════════════════ */

test("a published project is counted, one read at a time", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "counted", status: "published" });
    assert.equal(await read(h, "project", id), 1);
    assert.equal(await read(h, "project", id), 2);
    assert.equal(await read(h, "project", id), 3);
    assert.equal(await countOf(h, "project", id), 3);
  });
});

test("a published journal entry is counted separately from projects", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveJournal(h, { slug: "entry", status: "published" });
    assert.equal(await read(h, "journal", id), 1);
    assert.equal(await countOf(h, "journal", id), 1);
    assert.equal(await countOf(h, "project", id), null, "the same id under another kind is another count");
  });
});

test("a draft is never counted, and says so with null", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "draft-only", status: "draft" });
    assert.equal(await read(h, "project", id), null);
    assert.equal(await countOf(h, "project", id), null, "no row is created for it");
  });
});

test("an id that names nothing is not counted", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    assert.equal(await read(h, "journal", "00000000-0000-4000-8000-000000000000"), null);
  });
});

test("an unknown kind of content is refused", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "kind-check", status: "published" });
    await assert.rejects(read(h, "page", id), /Unknown content kind/);
  });
});

/* ══ 3. what the Studio must never notice ═════════════════ */

test("reading an entry does not move the version the Studio saves against", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "versioned", status: "published" });
    const version = async () =>
      (await h.query<{ t: string }>("select updated_at::text as t from projects where id = $1", [id]))[0].t;

    const before = await version();
    await read(h, "project", id);
    await read(h, "project", id);
    assert.equal(await version(), before, "a visit is not an edit");
  });
});

test("a save keeps the count, and a delete takes it away", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "lifecycle", status: "published" });
    await read(h, "project", id);
    await read(h, "project", id);

    await saveProject(h, { slug: "lifecycle", status: "published", title: "Renamed" }, id);
    assert.equal(await countOf(h, "project", id), 2, "editing the entry keeps its readers");

    await h.query("select public.delete_content('project', $1::uuid)", [id]);
    assert.equal(await countOf(h, "project", id), null, "deleting it leaves no orphaned count");
  });
});

/* ══ 4. what a visitor can and cannot do ══════════════════ */

test("a visitor can count a read and see the numbers", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "visited", status: "published" });
    await asVisitor(h, async () => {
      assert.equal(await read(h, "project", id), 1);
      const rows = await h.query<{ reads: string }>("select reads::text as reads from content_reads");
      assert.deepEqual(rows.map((r) => Number(r.reads)), [1]);
    });
  });
});

test("a visitor cannot write a count directly", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    const id = await saveProject(h, { slug: "guarded", status: "published" });
    await read(h, "project", id);

    await asVisitor(h, async () => {
      await refused(
        h,
        "insert into content_reads (owner_type, owner_id, reads) values ('project', $1, 1000000)",
        ["11111111-1111-4111-8111-111111111111"],
        /row-level security/
      );
      // Updates and deletes are filtered, not errors: RLS shows the visitor no
      // row it may change, so nothing matches.
      await h.query("update content_reads set reads = 1000000");
      await h.query("delete from content_reads");
    });

    assert.equal(await countOf(h, "project", id), 1, "the count is exactly what record_read made it");
  });
});

test("a visitor still cannot reach the Studio's write path", async () => {
  const h = await sharedDatabase(LATEST);
  await withRollback(h, async () => {
    await asVisitor(h, async () => {
      await refused(
        h,
        "select public.save_project(null, '{\"title\":\"x\",\"stream\":\"visual-design\"}'::jsonb, '[]'::jsonb, '{}'::uuid[])",
        [],
        /permission denied|Not authorized/
      );
    });
  });
});
