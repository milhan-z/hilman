import assert from "node:assert/strict";
import test, { after } from "node:test";
import { closeSharedDatabases, freshDatabase, sharedDatabase, withRollback, type Harness } from "./support/pg";

after(closeSharedDatabases);

// Supabase grants API roles table privileges, then relies on RLS. Reproduce
// that arrangement so permission-denied cannot hide a permissive policy.
async function grantApiAccess(h: Harness) {
  await h.db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  `);
}

async function asRole<T>(h: Harness, role: "anon" | "authenticated", body: () => Promise<T>) {
  await h.db.exec(`set role ${role}`);
  try {
    return await body();
  } finally {
    await h.db.exec("reset role");
  }
}

async function seedMedia(h: Harness) {
  await h.query(`insert into media (public_id, title, alt, folder)
    values ('hilman/unpublished', 'Unpublished client draft', 'Private description', 'unreleased')`);
}

test("0015 closes anonymous enumeration on an existing 0014 database and is repeatable", async () => {
  const h = await freshDatabase(14);
  try {
    await grantApiAccess(h);
    await seedMedia(h);
    const before = await asRole(h, "anon", () => h.query("select public_id, title, alt, folder from media"));
    assert.equal(before.length, 1, "the old policy exposes even an unattached upload");
    await h.apply(15);
    await h.apply(15);
    assert.deepEqual(await asRole(h, "anon", () => h.query("select * from media")), []);
    assert.equal((await h.query("select * from media")).length, 1, "the asset registry row is preserved");
  } finally {
    await h.close();
  }
});

test("anonymous readers cannot enumerate or modify the media library", async () => {
  const h = await sharedDatabase();
  await withRollback(h, async () => {
    await grantApiAccess(h);
    await seedMedia(h);
    await asRole(h, "anon", async () => {
      assert.deepEqual(await h.query("select * from media"), []);
      assert.deepEqual(await h.query("update media set title = 'changed' returning id"), []);
      assert.deepEqual(await h.query("delete from media returning id"), []);
    });
    const [row] = await h.query<{ title: string }>("select title from media");
    assert.equal(row.title, "Unpublished client draft");
  });
});

test("a signed-in non-owner cannot enumerate or modify the media library", async () => {
  const h = await sharedDatabase();
  await withRollback(h, async () => {
    await grantApiAccess(h);
    await seedMedia(h);
    await h.query("select set_config('test.user_id', gen_random_uuid()::text, false)");
    await asRole(h, "authenticated", async () => {
      assert.deepEqual(await h.query("select * from media"), []);
      assert.deepEqual(await h.query("update media set title = 'changed' returning id"), []);
      assert.deepEqual(await h.query("delete from media returning id"), []);
    });
    assert.equal((await h.query("select * from media")).length, 1);
  });
});

test("the confirmed owner retains media-library create, read, update and delete", async () => {
  const h = await sharedDatabase();
  await withRollback(h, async () => {
    await grantApiAccess(h);
    await asRole(h, "authenticated", async () => {
      await seedMedia(h);
      assert.equal((await h.query("select * from media")).length, 1);
      assert.deepEqual(await h.query("update media set title = 'Owner edit' returning title"), [{ title: "Owner edit" }]);
      assert.equal((await h.query("delete from media returning id")).length, 1);
    });
  });
});

test("published content still exposes its selected media while draft content stays private", async () => {
  const h = await sharedDatabase();
  await withRollback(h, async () => {
    await grantApiAccess(h);
    const rows = await h.query<{ id: string; status: string }>(`insert into projects
      (slug, title, status, cover_public_id) values
      ('visible', 'Visible work', 'published', 'hilman/published-cover'),
      ('private', 'Private work', 'draft', 'hilman/private-cover') returning id, status`);
    for (const row of rows) {
      await h.query(`insert into content_blocks (owner_type, owner_id, type, position, data)
        values ('project', $1, 'image', 0, $2::jsonb)`,
      [row.id, JSON.stringify({ public_id: `hilman/${row.status}-body` })]);
    }
    await asRole(h, "anon", async () => {
      assert.deepEqual(await h.query("select cover_public_id from projects"), [{ cover_public_id: "hilman/published-cover" }]);
      assert.deepEqual(await h.query("select data from content_blocks"), [{ data: { public_id: "hilman/published-body" } }]);
    });
  });
});
