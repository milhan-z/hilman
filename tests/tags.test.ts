import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import {
  describeBadTagNames,
  MAX_TAGS,
  matchTags,
  parseTagInput,
  readTagInput,
  resolveTagIds,
  sameTags,
  settleNewTags,
  tagFailureIsPermanent,
  tagInputText,
  tagsFromInput,
  tidyTagInput,
  type TagStore,
} from "../lib/tags";
import { docFromInitial, settleSnapshot, type EditorDoc } from "../components/admin/editor-doc";
import { closeSharedDatabases, latestMigration, sharedDatabase, withRollback, type Harness } from "./support/pg";

/**
 * Tags typed as "coding, design" — read, matched, and made.
 *
 * Three promises. What you type means what it says: existing tags are found
 * however they are spelt, and only a genuinely new name is new. A save that
 * makes tags can be delivered twice and still be one save. And a document
 * with no new tags is byte-for-byte what it was before any of this existed,
 * because the recovery copy and the dirty check compare serialised documents.
 */

const DESIGN = { id: "00000000-0000-4000-8000-000000000001", slug: "design", name: "Design" };
const UIUX = { id: "00000000-0000-4000-8000-000000000002", slug: "ui-ux", name: "UI/UX" };
const FILM = { id: "00000000-0000-4000-8000-000000000003", slug: "film", name: "Film" };
const KNOWN = [DESIGN, UIUX, FILM];

/* ── reading what was typed ───────────────────────────────── */

test("commas and line breaks separate; blanks and repeats disappear", () => {
  assert.deepEqual(parseTagInput("coding, Design,  ,design, UI/UX").names, ["coding", "Design", "UI/UX"]);
  assert.deepEqual(parseTagInput("coding\ndesign\n\n").names, ["coding", "design"]);
  assert.deepEqual(parseTagInput("  creative    coding  ").names, ["creative coding"]);
  assert.deepEqual(parseTagInput("").names, []);
  assert.deepEqual(parseTagInput(" , ,, ").names, []);
});

test("a piece with nothing a slug can keep is reported, not made", () => {
  const parsed = parseTagInput("coding, 🎨, !!!");
  assert.deepEqual(parsed.names, ["coding"]);
  assert.deepEqual(parsed.unusable, ["🎨", "!!!"]);
});

test("more than the limit is cut, and says so", () => {
  const many = Array.from({ length: MAX_TAGS + 3 }, (_, i) => `tag ${i}`).join(", ");
  const parsed = parseTagInput(many);
  assert.equal(parsed.names.length, MAX_TAGS);
  assert.equal(parsed.truncated, true);
  assert.equal(parseTagInput("a, b").truncated, false);
});

test("existing tags are found by name in any case, or by the slug they would get", () => {
  const { ids, fresh } = matchTags(["DESIGN", "ui/ux", "Film ", "coding"], KNOWN);
  assert.deepEqual(ids, [DESIGN.id, UIUX.id, FILM.id]);
  assert.deepEqual(fresh, ["coding"]);
  // "UI UX" has a different slug from "ui/ux" but the same one as the tag.
  assert.deepEqual(matchTags(["UI UX"], KNOWN).ids, [UIUX.id]);
});

test("the field shows existing tags as stored and marks the rest new", () => {
  const read = readTagInput("design, coding, ui/ux, UI UX", KNOWN);
  assert.deepEqual(read.items, [
    { name: "Design", id: DESIGN.id },
    { name: "coding", id: null },
    { name: "UI/UX", id: UIUX.id },
  ]);
  assert.equal(tidyTagInput("design,coding ,, ui/ux,", KNOWN), "Design, coding, UI/UX");
});

test("typing tells the document ids and names, and leaves names out when there are none", () => {
  assert.deepEqual(tagsFromInput("design, coding", KNOWN), { tagIds: [DESIGN.id], newTags: ["coding"] });
  const onlyExisting = tagsFromInput("Design, film", KNOWN);
  assert.deepEqual(onlyExisting, { tagIds: [DESIGN.id, FILM.id] });
  assert.ok(!("newTags" in onlyExisting), "absent, not empty");
  assert.equal(tagInputText([DESIGN.id, FILM.id], ["coding"], KNOWN), "Design, Film, coding");
});

test("the same tags in another order are the same tags", () => {
  assert.equal(sameTags({ tagIds: ["a", "b"] }, { tagIds: ["b", "a"] }), true);
  assert.equal(sameTags({ tagIds: ["a"], newTags: ["x"] }, { tagIds: ["a"] }), false);
  assert.equal(sameTags({ tagIds: [] }, { tagIds: [], newTags: undefined }), true);
});

/* ── what the queue will carry ────────────────────────────── */

test("the server accepts names as the editor sends them, and nothing else", () => {
  assert.equal(describeBadTagNames(undefined), null);
  assert.equal(describeBadTagNames(["coding", "Creative Coding"]), null);
  assert.match(describeBadTagNames("coding") ?? "", /list/);
  assert.match(describeBadTagNames([42]) ?? "", /name/);
  assert.match(describeBadTagNames(["a, b"]) ?? "", /comma/);
  // The editor only ever sends names it has already tidied.
  assert.match(describeBadTagNames(["creative    coding"]) ?? "", /not a tag name as written/);
  assert.match(describeBadTagNames(["x".repeat(60)]) ?? "", /not a tag name as written/);
  assert.match(describeBadTagNames(["🎨"]) ?? "", /letter or number/);
  assert.match(describeBadTagNames(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`)) ?? "", /at most/);
});

/* ── folding names into ids after a save ──────────────────── */

test("a name that has become a tag is folded into the ids", () => {
  const doc = { tagIds: [DESIGN.id], newTags: ["coding", "motion"] };
  const coding = { id: "00000000-0000-4000-8000-00000000000c", slug: "coding", name: "coding" };
  assert.deepEqual(settleNewTags(doc, [...KNOWN, coding]), { tagIds: [DESIGN.id, coding.id], newTags: ["motion"] });

  const all = settleNewTags({ tagIds: [], newTags: ["coding"] }, [coding]);
  assert.deepEqual(all, { tagIds: [coding.id] });
  assert.ok(!("newTags" in all), "the key goes when the last name does");
});

test("nothing to fold returns the very same document", () => {
  const plain = { tagIds: [DESIGN.id] };
  assert.equal(settleNewTags(plain, KNOWN), plain);
  const unmade = { tagIds: [], newTags: ["still new"] };
  assert.equal(settleNewTags(unmade, KNOWN), unmade);
});

test("an untouched document serialises exactly as it did before new tags existed", () => {
  const doc = docFromInitial({ id: "x", title: "An entry", tags: [DESIGN] } as never);
  assert.ok(!("newTags" in doc));
  assert.ok(!JSON.stringify(doc).includes("newTags"));
});

test("a snapshot folds to the same string as the document it was taken from", () => {
  const coding = { id: "00000000-0000-4000-8000-00000000000c", slug: "coding", name: "coding" };
  const doc: EditorDoc = { ...docFromInitial(null), title: "Draft", tagIds: [DESIGN.id], newTags: ["coding"] };
  const snapshot = JSON.stringify(doc);

  assert.equal(settleSnapshot(snapshot, [...KNOWN, coding]), JSON.stringify(settleNewTags(doc, [...KNOWN, coding])));
  // Nothing to fold: not even re-serialised.
  assert.equal(settleSnapshot(snapshot, KNOWN), snapshot);
  const plain = JSON.stringify(docFromInitial(null));
  assert.equal(settleSnapshot(plain, KNOWN), plain);
});

/* ── making them, against a pretend database ──────────────── */

function memoryStore(initial = KNOWN.map((tag) => ({ ...tag }))) {
  const rows = initial;
  let inserts = 0;
  const store: TagStore = {
    async list() {
      return rows.map((row) => ({ ...row }));
    },
    async insert(next) {
      inserts++;
      for (const row of next) {
        if (rows.some((existing) => existing.slug === row.slug)) continue; // on conflict do nothing
        rows.push({ id: `00000000-0000-4000-8000-${String(rows.length + 100).padStart(12, "0")}`, ...row });
      }
    },
  };
  return { store, rows, inserts: () => inserts };
}

test("only names with no tag are made, and every id comes back", async () => {
  const db = memoryStore();
  const ids = await resolveTagIds(db.store, [FILM.id], ["design", "coding", "Motion"]);
  assert.equal(db.rows.length, KNOWN.length + 2);
  const coding = db.rows.find((row) => row.slug === "coding")!;
  const motion = db.rows.find((row) => row.slug === "motion")!;
  assert.equal(motion.name, "Motion", "made as typed");
  assert.deepEqual(ids, [FILM.id, DESIGN.id, coding.id, motion.id]);
});

test("a retry finds what the first attempt made and asks for the same ids", async () => {
  const db = memoryStore();
  const first = await resolveTagIds(db.store, [], ["coding", "design"]);
  const second = await resolveTagIds(db.store, [], ["coding", "design"]);
  assert.deepEqual(second, first);
  assert.equal(db.inserts(), 1, "the second delivery makes nothing");
});

test("names that are all tags already never write", async () => {
  const db = memoryStore();
  assert.deepEqual(await resolveTagIds(db.store, [], ["Design", "ui/ux"]), [DESIGN.id, UIUX.id]);
  assert.equal(db.inserts(), 0);
  assert.deepEqual(await resolveTagIds(db.store, [FILM.id], undefined), [FILM.id]);
});

test("a refusal goes back to the editor; a dropped connection goes round again", () => {
  // What postgrest-js hands back for each, rather than throwing.
  assert.equal(tagFailureIsPermanent({ code: "42501", message: "new row violates row-level security policy" }), true);
  assert.equal(tagFailureIsPermanent({ code: "23514", message: "check" }), true);
  assert.equal(tagFailureIsPermanent({ code: "", message: "TypeError: fetch failed" }), false);
  assert.equal(tagFailureIsPermanent({ code: "PGRST000", message: "could not connect" }), false);
  assert.equal(tagFailureIsPermanent(new Error('Couldn\'t create the tag "coding".')), true);
  assert.equal(tagFailureIsPermanent(null), true);
});

test("a tag that still isn't there after the write stops the save", async () => {
  const refusing: TagStore = { list: async () => [], insert: async () => {} };
  await assert.rejects(resolveTagIds(refusing, [], ["coding"]), (error: Error & { code?: string }) => {
    assert.match(error.message, /"coding"/);
    assert.equal(error.code, undefined, "no code: the route treats it as a refusal, not a blip");
    return true;
  });
});

/* ── where the pieces sit ─────────────────────────────────── */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the sync route makes tags last, after everything that could refuse the save", () => {
  // A publish held back by the quality gate must not leave new tags behind.
  const route = source("app/api/studio/sync/route.ts");
  const gate = route.indexOf('reason: "CONTENT_BLOCKED"');
  const make = route.indexOf("resolveTagIds(tagStore(supabase)");
  const save = route.indexOf('supabase.rpc("save_content_synced"');
  assert.ok(gate > 0 && make > gate && save > make, "gate, then tags, then the save");
  assert.match(route, /p_tag_ids: tagIds,/, "the save carries the resolved ids");
  assert.match(route, /onConflict: "slug", ignoreDuplicates: true/, "a tag made a moment ago is not an error");
});

test("the editor sends names only when there are some", () => {
  const editor = source("components/admin/live-editor.tsx");
  assert.match(editor, /\.\.\.\(source\.newTags\?\.length \? \{ tagNames: source\.newTags \} : \{\}\)/);
  assert.match(editor, /setKept\(\(prev\) => settleSnapshot\(prev, fresh\)\)/, "the fold moves the snapshots too");
  assert.match(editor, /setSynced\(\(prev\) => settleSnapshot\(prev, fresh\)\)/);
});

/* ── and against the real schema ──────────────────────────── */

after(closeSharedDatabases);

/**
 * A signed-in session, as PostgREST would run it: RLS on, as `authenticated`,
 * with the privileges Supabase grants that role at bootstrap and PGlite does
 * not — auth.uid() included. Whoever `test.user_id` names is the one signed in.
 */
async function asSignedIn<T>(h: Harness, body: () => Promise<T>): Promise<T> {
  await h.db.exec(`
    grant usage on schema public, auth to authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on function auth.uid() to authenticated;
    set role authenticated;
  `);
  try {
    return await body();
  } finally {
    // After a failure the transaction refuses even this, and the rollback
    // undoes the SET anyway — so the failure that matters is the one reported.
    await h.db.exec("reset role").catch(() => {});
  }
}

/** What the sync route does through supabase-js, in the SQL it becomes. */
function sqlStore(h: Harness): TagStore {
  return {
    list: () => h.query("select id::text as id, slug, name from tags"),
    async insert(rows) {
      for (const row of rows) {
        await h.query("insert into tags (name, slug) values ($1, $2) on conflict (slug) do nothing", [row.name, row.slug]);
      }
    },
  };
}

test("the owner can make tags under RLS, and a replayed save stays one save", async () => {
  const h = await sharedDatabase(latestMigration());
  await withRollback(h, async () => {
    await asSignedIn(h, async () => {
      const mutationId = "11111111-2222-4333-8444-555555555555";
      const save = async () => {
        const ids = await resolveTagIds(sqlStore(h), [], ["coding", "Creative Coding"]);
        const [row] = await h.query<{ out: { status: string; id: string; replayed: boolean } }>(
          "select public.save_content_synced($1::uuid, 'journal', null, null, $2::jsonb, '[]'::jsonb, $3::uuid[]) as out",
          [mutationId, JSON.stringify({ title: "Tagged", slug: "tagged", status: "draft" }), ids]
        );
        return row.out;
      };

      const first = await save();
      assert.equal(first.status, "saved");
      assert.equal(first.replayed, false);

      // The response was lost; the phone sends the same mutation again.
      const again = await save();
      assert.equal(again.status, "saved");
      assert.equal(again.replayed, true, "same names, same ids, same digest");
      assert.equal(again.id, first.id);

      const tags = await h.query<{ slug: string }>(
        "select t.slug from journal_tags jt join tags t on t.id = jt.tag_id where jt.journal_id = $1 order by t.slug",
        [first.id]
      );
      assert.deepEqual(tags.map((tag) => tag.slug), ["coding", "creative-coding"]);
      const [made] = await h.query<{ n: number }>("select count(*)::int as n from tags where slug in ('coding', 'creative-coding')");
      assert.equal(made.n, 2, "made once, not once per delivery");
    });
  });
});

test("an account that isn't the owner is refused by the database, with a code that says so", async () => {
  // The route checks ownership first; this is what stands behind it. And the
  // code matters: 42501 is what the route reads as "will refuse again".
  const h = await sharedDatabase(latestMigration());
  await withRollback(h, async () => {
    await h.query("select set_config('test.user_id', gen_random_uuid()::text, true)");
    await asSignedIn(h, async () => {
      await assert.rejects(resolveTagIds(sqlStore(h), [], ["sneaky"]), (error: Error & { code?: string }) => {
        assert.equal(error.code, "42501");
        return true;
      });
    });
  });
});
