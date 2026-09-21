import assert from "node:assert/strict";
import test, { after } from "node:test";

import {
  closeSharedDatabases,
  freshDatabase,
  latestMigration,
  migrationName,
  sharedDatabase,
  withRollback,
  type Harness,
} from "./support/pg";
import { authorDateInput, formatDate, isRealCalendarDay, isoFromAuthorDate } from "../lib/dates";
import { normaliseFields } from "../lib/studio-content";
import { docFromInitial, fieldsFor, publicationDateChanged } from "../components/admin/editor-doc";
import type { JournalPost, Project } from "../lib/types";

/**
 * When something was published, and who gets to decide it.
 *
 * ── the two failures this file exists to end ──
 *
 * 1. Migration 0007 gave both save functions a local called `v_chosen` and
 *    declared it in only one of them. `save_journal_post` reads it three
 *    times. plpgsql resolves names inside SQL expressions when the statement
 *    first runs, not when the function is created, so the migration applied
 *    without a murmur and every journal save afterwards failed with
 *    `column "v_chosen" does not exist`. Projects were fine. Journal entries
 *    could not be saved at all.
 *
 *    Nothing that reads the SQL as text could have caught this — the string
 *    `v_chosen` was present exactly where it was expected to be. So these
 *    tests run the functions in a real PostgreSQL.
 *
 * 2. The editor loaded the stored instant into a date picker and sent the
 *    picker's day back on every save, re-anchored to midday. Editing a typo in
 *    an entry stored at 2026-09-17T18:30:00Z moved it to 2026-09-18T05:00:00Z.
 *    The same calendar day in Jakarta, so the site looked identical and
 *    nothing reported anything — and the actual moment of publication was
 *    gone, permanently, a few characters at a time.
 */

const LATEST = latestMigration();

const project = (extra: Record<string, unknown> = {}) => ({
  title: "A piece",
  slug: "a-piece",
  stream: "visual-design",
  status: "draft",
  ...extra,
});

const journal = (extra: Record<string, unknown> = {}) => ({
  title: "An entry",
  slug: "an-entry",
  status: "draft",
  reading_minutes: "3",
  ...extra,
});

async function saveProject(h: Harness, id: string | null, data: Record<string, unknown>) {
  const [row] = await h.query<{ id: string }>(
    "select public.save_project($1::uuid, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as id",
    [id, JSON.stringify(data)]
  );
  return row.id;
}

async function saveJournal(h: Harness, id: string | null, data: Record<string, unknown>) {
  const [row] = await h.query<{ id: string }>(
    "select public.save_journal_post($1::uuid, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as id",
    [id, JSON.stringify(data)]
  );
  return row.id;
}

async function publishedAtOf(h: Harness, table: string, id: string) {
  const [row] = await h.query<{ published_at: Date | null }>(
    `select published_at from ${table} where id = $1`,
    [id]
  );
  return row.published_at;
}

/* ══ 1. the journal RPC, which 0007 broke outright ═════════ */

test("migration 0007 on its own leaves the journal save unable to run", async () => {
  // The reproduction, kept so the corrective migration can never be quietly
  // reverted into a no-op. This is the state the deployed database was in.
  const h = await freshDatabase(7);
  await h.signInAsOwner();

  await assert.rejects(
    () => saveJournal(h, null, journal()),
    /v_chosen/,
    "this is what every journal save was hitting"
  );
  // And the project save was unaffected, which is why it went unnoticed.
  assert.ok(await saveProject(h, null, project()));

  await h.close();
});

test("the corrective migration applies on top of 0007 and fixes it", async () => {
  const h = await freshDatabase(7);
  await h.signInAsOwner();
  await assert.rejects(() => saveJournal(h, null, journal()));

  await h.applyThrough(7, LATEST); // the upgrade path a live database takes

  const id = await saveJournal(h, null, journal());
  assert.ok(id, "journal entries can be saved again");
  await h.close();
});

test("a fresh install ends in the same place as an upgraded one", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  assert.ok(await saveJournal(h, null, journal()));
  assert.ok(await saveProject(h, null, project()));
  });
});

test("the corrective migration is safe to run twice", async () => {
  const h = await freshDatabase(LATEST);
  await h.apply(LATEST);
  await h.signInAsOwner();
  assert.ok(await saveJournal(h, null, journal()));
  await h.close();
});

test("the studio's actual save path works for both kinds of content", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  for (const [entity, data] of [
    ["journal", journal()],
    ["project", project()],
  ] as const) {
    const [row] = await h.query<{ out: { status: string; id: string } }>(
      "select public.save_content_synced(gen_random_uuid(), $1, null, null, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
      [entity, JSON.stringify(data)]
    );
    assert.equal(row.out.status, "saved", entity);
  }
  });
});

/* ══ 2. what a publication date does across a life ═════════ */

for (const kind of ["project", "journal"] as const) {
  const table = kind === "project" ? "projects" : "journal_posts";
  const save = kind === "project" ? saveProject : saveJournal;
  const data = kind === "project" ? project : journal;

  test(`${kind}: a draft with no chosen date has no date`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await save(h, null, data());
    assert.equal(await publishedAtOf(h, table, id), null);
    });
  });

  test(`${kind}: first publish stamps the date the site did it`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {
    const id = await save(h, null, data({ status: "published" }));
    assert.notEqual(await publishedAtOf(h, table, id), null, "the site dated it");
    });
  });

  test(`${kind}: editing published content without touching the date changes nothing`, async () => {
    // The whole of failure 2, at the layer that actually stores it.
    await withRollback(await sharedDatabase(LATEST), async (h) => {

    const id = await save(h, null, data({ status: "published" }));
    const before = await publishedAtOf(h, table, id);

    await save(h, id, data({ status: "published", title: "A piece, with a typo fixed" }));
    const after = await publishedAtOf(h, table, id);

    assert.deepEqual(after, before, "to the millisecond, not to the day");
    });
  });

  test(`${kind}: an author's chosen date is what gets stored`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {

    const chosen = isoFromAuthorDate("2026-09-18")!;
    const id = await save(h, null, data({ status: "published", published_at: chosen }));

    assert.equal((await publishedAtOf(h, table, id))!.toISOString(), chosen);
    });
  });

  test(`${kind}: re-dating something already published moves it`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {

    const id = await save(h, null, data({ status: "published" }));
    const moved = isoFromAuthorDate("2024-03-02")!;
    await save(h, id, data({ status: "published", published_at: moved }));

    assert.equal((await publishedAtOf(h, table, id))!.toISOString(), moved);
    });
  });

  test(`${kind}: a date chosen while still a draft survives until publication`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {

    const chosen = isoFromAuthorDate("2026-01-09")!;
    const id = await save(h, null, data({ status: "draft", published_at: chosen }));
    assert.equal(
      (await publishedAtOf(h, table, id))!.toISOString(),
      chosen,
      "held on the draft"
    );

    await save(h, id, data({ status: "published" }));
    assert.equal(
      (await publishedAtOf(h, table, id))!.toISOString(),
      chosen,
      "and publishing does not overwrite it with now()"
    );
    });
  });

  test(`${kind}: unpublishing and republishing keeps the original date`, async () => {
    await withRollback(await sharedDatabase(LATEST), async (h) => {

    const id = await save(h, null, data({ status: "published" }));
    const first = await publishedAtOf(h, table, id);

    await save(h, id, data({ status: "draft" }));
    await save(h, id, data({ status: "published" }));

    assert.deepEqual(
      await publishedAtOf(h, table, id),
      first,
      "it was published on the day it was published"
    );
    });
  });
}

/* ══ 3. one mutation id, one payload — on the server too ═══ */

test("a genuine retry of the same save is still answered from the ledger", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  const id = "11111111-1111-4111-8111-111111111111";
  const call = () =>
    h.query<{ out: { status: string; replayed: boolean; id: string } }>(
      "select public.save_content_synced($1::uuid, 'journal', null, null, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
      [id, JSON.stringify(journal())]
    );

  const [first] = await call();
  const [again] = await call();

  assert.equal(first.out.replayed, false);
  assert.equal(again.out.replayed, true, "recognised, not written twice");
  assert.equal(again.out.id, first.out.id);

  const [{ rows }] = await h.query<{ rows: number }>(
    "select count(*)::int as rows from journal_posts"
  );
  assert.equal(rows, 1, "exactly one row, whatever the network did");
  });
});

test("a mutation id carrying different writing the second time is refused", async () => {
  // Defence in depth for the client rule in lib/studio-local/outbox.ts. If an
  // old tab, a stale bundle or a bug ever sends a new payload under a spent
  // id, the ledger would otherwise report the *first* save's result and the
  // editor would mark the newer writing as saved. Loud beats wrong.
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  const id = "22222222-2222-4222-8222-222222222222";
  const send = (title: string) =>
    h.query(
      "select public.save_content_synced($1::uuid, 'journal', null, null, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
      [id, JSON.stringify(journal({ title }))]
    );

  await send("A");
  await assert.rejects(() => send("B"), /already used for a different save/);
  });
});

test("mutations recorded before the corrective migration still replay", async () => {
  // The digest column is nullable precisely so an upgrade does not invalidate
  // whatever is already in a phone's outbox.
  const h = await freshDatabase(7);
  await h.signInAsOwner();

  const id = "33333333-3333-4333-8333-333333333333";
  await h.query(
    "select public.save_content_synced($1::uuid, 'project', null, null, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
    [id, JSON.stringify(project())]
  );

  await h.applyThrough(7, LATEST);

  const [row] = await h.query<{ out: { status: string; replayed: boolean } }>(
    "select public.save_content_synced($1::uuid, 'project', null, null, $2::jsonb, '[]'::jsonb, '{}'::uuid[]) as out",
    [id, JSON.stringify(project())]
  );
  assert.equal(row.out.replayed, true, "a pre-upgrade id is honoured, not refused");
  await h.close();
});

/* ══ 4. the intent model, before anything reaches SQL ══════ */

const storedRow = (published_at: string | null) =>
  ({
    id: "abc",
    title: "An entry",
    slug: "an-entry",
    status: "published",
    published_at,
  }) as unknown as Project & JournalPost;

test("an untouched date field sends nothing at all", async () => {
  // 18:30 UTC on the 17th is already the 18th in Jakarta, so the picker shows
  // the 18th. Sending the 18th back would store midday on the 18th — a
  // different instant, the same day, and no way to notice.
  const evening = "2026-09-17T18:30:00.000Z";
  const doc = docFromInitial(storedRow(evening));

  assert.equal(doc.publishedOn, "2026-09-18", "the picker shows the author's day");
  assert.equal(publicationDateChanged(doc), false, "and nothing has been decided");

  for (const kind of ["project", "journal"] as const) {
    assert.equal("published_at" in fieldsFor(kind, doc), false, kind);
  }
});

test("the exact stored instant survives an ordinary edit", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  const exact = "2026-09-17T18:30:00.000Z";
  const id = await saveJournal(h, null, journal({ status: "published", published_at: exact }));
  assert.equal((await publishedAtOf(h, "journal_posts", id))!.toISOString(), exact);

  // Reopen it in the editor, change the body, save. The whole round trip.
  const doc = docFromInitial(storedRow(exact));
  const edited = { ...doc, title: "An entry, revised" };
  const fields = normaliseFields("journal", fieldsFor("journal", edited));

  await saveJournal(h, id, { ...journal(), ...fields, status: "published" });

  assert.equal(
    (await publishedAtOf(h, "journal_posts", id))!.toISOString(),
    exact,
    "18:30, not midday"
  );
  });
});

test("choosing a different day is sent, and is the day it says", async () => {
  const doc = docFromInitial(storedRow("2026-09-17T18:30:00.000Z"));
  const moved = { ...doc, publishedOn: "2026-09-20" };

  assert.equal(publicationDateChanged(moved), true);
  const fields = fieldsFor("journal", moved);
  assert.equal(formatDate(String(fields.published_at)), "Sep 20, 2026");
});

test("re-picking the day it already falls on is not a change", async () => {
  const doc = docFromInitial(storedRow("2026-09-17T18:30:00.000Z"));
  const same = { ...doc, publishedOn: "2026-09-18" };

  assert.equal(publicationDateChanged(same), false);
  assert.equal("published_at" in fieldsFor("journal", same), false, "so nothing moves");
});

test("an entry that has never been published can be given a date", async () => {
  const doc = docFromInitial(storedRow(null));
  assert.equal(doc.publishedOn, "", "nothing to show");

  const dated = { ...doc, publishedOn: "2025-12-31" };
  assert.equal(publicationDateChanged(dated), true);
  assert.equal(fieldsFor("journal", dated).published_at, isoFromAuthorDate("2025-12-31"));
});

test("emptying the field never asks the database to erase a date", async () => {
  // Absent, not null. A null would read as "clear it", and an untouched form
  // field must not be able to express a destructive instruction.
  const doc = docFromInitial(storedRow("2026-09-17T18:30:00.000Z"));
  const emptied = { ...doc, publishedOn: "" };

  const fields = fieldsFor("journal", emptied);
  assert.equal("published_at" in fields, false);
  assert.equal(fields.published_at, undefined);
});

test("emptying the field leaves the stored date exactly where it was", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  const exact = "2024-05-06T01:02:03.000Z";
  const id = await saveJournal(h, null, journal({ status: "published", published_at: exact }));

  const emptied = { ...docFromInitial(storedRow(exact)), publishedOn: "" };
  const fields = normaliseFields("journal", fieldsFor("journal", emptied));
  await saveJournal(h, id, { ...journal(), ...fields, status: "published" });

  assert.equal((await publishedAtOf(h, "journal_posts", id))!.toISOString(), exact);
  });
});

/* ══ 5. a day that does not exist ══════════════════════════ */

test("an impossible calendar day is refused, not rolled over", async () => {
  // `new Date("2026-02-31")` does not fail — it hands back the 3rd of March.
  // A typo in a date picker became a real publication date three days out.
  for (const impossible of ["2026-02-31", "2026-02-30", "2025-02-29", "2026-04-31", "2026-06-31"]) {
    assert.equal(isoFromAuthorDate(impossible), null, impossible);
  }
});

test("real days, including a leap day, still work", async () => {
  for (const real of ["2024-02-29", "2026-02-28", "2026-12-31", "2026-01-01", "2026-04-30"]) {
    const iso = isoFromAuthorDate(real);
    assert.ok(iso, real);
    assert.equal(authorDateInput(iso), real, `${real} round-trips`);
  }
});

test("the calendar check answers the question directly", async () => {
  assert.equal(isRealCalendarDay(2024, 2, 29), true);
  assert.equal(isRealCalendarDay(2025, 2, 29), false);
  assert.equal(isRealCalendarDay(2026, 13, 1), false);
  assert.equal(isRealCalendarDay(2026, 0, 1), false);
  assert.equal(isRealCalendarDay(2026, 1, 0), false);
  assert.equal(isRealCalendarDay(2026, 1, 32), false);
});

test("an impossible day is refused at the server boundary too", async () => {
  // The editor is not the only way in — /api/studio/sync takes a payload a
  // client composed, and the RPC casts it straight to timestamptz.
  for (const impossible of ["2026-02-31", "2026-02-31T12:00:00.000Z", "2026-04-31T05:00:00Z"]) {
    const out = normaliseFields("journal", { title: "An entry", published_at: impossible });
    assert.equal("published_at" in out, false, impossible);
  }
});

test("a real instant still passes the boundary unchanged", async () => {
  const out = normaliseFields("journal", {
    title: "An entry",
    published_at: "2026-09-17T18:30:00.000Z",
  });
  assert.equal(out.published_at, "2026-09-17T18:30:00.000Z");
});

test("a date the database could never store is never handed to it", async () => {
  await withRollback(await sharedDatabase(LATEST), async (h) => {

  // Proof that the boundary is what protects the cast: hand the RPC the raw
  // string and it raises, which is the error the editor would otherwise see.
  // Inside a savepoint, because a raise aborts the surrounding transaction and
  // the second half of this test still has work to do.
  await h.db.exec("savepoint impossible");
  await assert.rejects(
    () => saveJournal(h, null, journal({ published_at: "2026-02-31T12:00:00+07:00" })),
    /date\/time field value out of range|invalid input syntax/i
  );
  await h.db.exec("rollback to savepoint impossible");

  // And through the boundary, it simply never arrives.
  const fields = normaliseFields("journal", {
    title: "An entry",
    published_at: "2026-02-31T12:00:00+07:00",
  });
  const id = await saveJournal(h, null, { ...journal(), ...fields });
  assert.equal(await publishedAtOf(h, "journal_posts", id), null);
  });
});

/* ══ 6. the migration is forward, not a rewrite ════════════ */

test("0007 is left exactly as it was deployed", async () => {
  // It has already been applied to the live project. Editing it would make the
  // repository disagree with the database it is supposed to describe, and the
  // corrective migration would never run.
  assert.equal(migrationName(7), "0007_author_publication_date.sql");
  assert.equal(migrationName(8), "0008_fix_author_publication_date.sql");
});

after(async () => {
  await closeSharedDatabases();
});
