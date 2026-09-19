import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normaliseFields } from "../lib/studio-content";
import {
  AUTHOR_TIME_ZONE,
  authorDateInput,
  currentYear,
  formatDate,
  formatDateParts,
  isoFromAuthorDate,
  yearOf,
} from "../lib/dates";

/**
 * One entry, one calendar day, everywhere.
 *
 * The bug: a journal entry read **SEP 17** on its own page and **18 SEP** in
 * the listing, from the same row at the same moment. The detail page is a
 * server component so `toLocaleDateString` answered in Node's UTC; the
 * listing hydrates inside a `"use client"` explorer so the same call answered
 * in the browser's zone. Nothing had ever said which zone a publication date
 * should be read in, so each renderer used whichever it happened to be in.
 *
 * These tests pin the property that fixes it: the day is a fact about the
 * entry, not about the reader.
 */

/** 18:30 UTC on the 17th is already the 18th in Jakarta. The exact split. */
const EVENING = "2026-09-17T18:30:00.000Z";
/** Midday UTC, where every zone in play agrees, as a control. */
const MIDDAY = "2026-09-17T12:00:00.000Z";

test("the reported case: an evening UTC timestamp is the next day here", () => {
  assert.equal(formatDate(EVENING), "Sep 18, 2026");
  assert.equal(formatDateParts(EVENING).day, "18");
  assert.equal(yearOf(EVENING), "2026");
});

test("the long form and the date rail never disagree about the day", () => {
  // This is the whole bug, as an assertion. Two presentations, one day.
  for (const iso of [EVENING, MIDDAY, "2026-01-01T00:00:00.000Z", "2025-12-31T23:59:59.000Z"]) {
    const long = formatDate(iso);
    const rail = formatDateParts(iso);
    assert.ok(
      long.includes(String(Number(rail.day))),
      `${iso}: "${long}" and rail day "${rail.day}" must be the same day`
    );
    assert.ok(long.endsWith(rail.year), `${iso}: years must match`);
  }
});

test("the year a card is filed under is the year printed on it", () => {
  // groupByYear used to call getFullYear(), so an entry could sit under one
  // heading while its own date read as another year.
  for (const iso of ["2025-12-31T17:00:00.000Z", "2026-01-01T00:30:00.000Z", EVENING]) {
    assert.equal(yearOf(iso), formatDateParts(iso).year, iso);
  }
});

test("New Year's Eve in UTC is already New Year's Day here, consistently", () => {
  // 17:00 UTC on 31 Dec is 00:00 on 1 Jan in Jakarta. Everything must agree.
  const nye = "2025-12-31T17:00:00.000Z";
  assert.equal(formatDate(nye), "Jan 1, 2026");
  assert.equal(yearOf(nye), "2026");
  assert.equal(formatDateParts(nye).year, "2026");
});

test("the answer does not depend on the machine reading it", () => {
  // The real defence: the same instant formatted twice must be identical, and
  // it must not track whatever TZ the process happens to carry. Node honours
  // an explicit `timeZone` regardless of process.env.TZ, which is exactly why
  // naming one fixes a server/client split.
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Jakarta"]) {
      process.env.TZ = tz;
      assert.equal(formatDate(EVENING), "Sep 18, 2026", `TZ=${tz}`);
      assert.equal(yearOf(EVENING), "2026", `TZ=${tz}`);
      assert.equal(formatDateParts(EVENING).day, "18", `TZ=${tz}`);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

test("the zone is named once and is the author's, not the server's", () => {
  assert.equal(AUTHOR_TIME_ZONE, "Asia/Jakarta");
  // And it is genuinely applied rather than merely declared.
  assert.notEqual(
    formatDate(EVENING),
    new Date(EVENING).toLocaleDateString("en-US", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  );
});

/* ── nothing renders a date any other way ─────────────────── */

const code = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no public page reads a date without saying which zone", () => {
  // Patching only the card that showed the symptom would leave the same bug
  // waiting in the grouping, the footer and anything added later.
  for (const path of [
    "components/journal-card.tsx",
    "components/journal-explorer.tsx",
    "components/site-footer.tsx",
    "app/(site)/journal/[slug]/page.tsx",
  ]) {
    const src = code(path);
    assert.ok(!/getFullYear\(\)/.test(src), `${path} must not read a year from the local zone`);
    assert.ok(!/\.getDate\(\)/.test(src), `${path} must not read a day from the local zone`);
    assert.ok(
      !/toLocaleDateString|toLocaleString/.test(src),
      `${path} must not format a date without a zone`
    );
  }
});

test("the shared reader is the only place that names a zone", () => {
  const dates = code("lib/dates.ts");
  assert.match(dates, /timeZone: AUTHOR_TIME_ZONE/, "every formatter uses it");
  // Three formatters, three uses — long form, rail, year.
  assert.equal((dates.match(/timeZone: AUTHOR_TIME_ZONE/g) ?? []).length, 3);
});

/* ── a date the author chose ──────────────────────────────── */

test("a picked calendar day survives the round trip", () => {
  const iso = isoFromAuthorDate("2026-09-18");
  assert.ok(iso, "a valid day parses");
  assert.equal(formatDate(iso), "Sep 18, 2026", "and still reads as that day");
  assert.equal(authorDateInput(iso), "2026-09-18", "and comes back for the input unchanged");
});

test("the stored instant lands on the intended day, not its edges", () => {
  // Anchored at midday in the author's zone rather than midnight, so a reader
  // whose offset runs the other way cannot pull it onto the day before.
  const iso = isoFromAuthorDate("2026-01-01")!;
  assert.equal(formatDate(iso), "Jan 1, 2026");
  assert.match(iso, /T05:00:00\.000Z$/, "midday in Jakarta is 05:00 UTC");
});

test("a malformed day is refused rather than guessed at", () => {
  for (const bad of ["", "not a date", "2026-13-01x", "18/09/2026", "2026-9-8"]) {
    assert.equal(isoFromAuthorDate(bad), null, bad);
  }
});

test("an entry with no date says so instead of inventing one", () => {
  for (const empty of [null, undefined, "", "nonsense"]) {
    assert.equal(formatDate(empty), "");
    assert.equal(yearOf(empty), null);
    assert.equal(authorDateInput(empty), "");
    assert.deepEqual(formatDateParts(empty), { day: "··", month: "———", year: "" });
  }
});

test("the footer's year comes from the same clock as everything else", () => {
  assert.match(currentYear(), /^\d{4}$/);
});

/* ── a date the author chose reaches the database ─────────── */

/**
 * The column already existed and the RPC already owned it: `published_at` was
 * stamped with now() on first publish and preserved for ever after. Good
 * default, only option. These pin the override without weakening the rule
 * that an untouched field changes nothing.
 */

test("a chosen date survives the save boundary", () => {
  for (const kind of ["project", "journal"] as const) {
    const out = normaliseFields(kind, {
      title: "A piece",
      published_at: "2026-09-18T05:00:00.000Z",
    });
    assert.equal(out.published_at, "2026-09-18T05:00:00.000Z", kind);
  }
});

test("an untouched date field is absent, never null", () => {
  // The migration reads a missing key as "leave the existing date alone".
  // A null would read as "clear it", which is a destructive instruction and
  // must never be the accidental result of an empty form field.
  for (const kind of ["project", "journal"] as const) {
    for (const empty of [undefined, "", "   ", null]) {
      const out = normaliseFields(kind, { title: "A piece", published_at: empty });
      assert.equal("published_at" in out, false, `${kind} / ${JSON.stringify(empty)}`);
    }
  }
});

test("an unparseable date is dropped rather than handed to the database", () => {
  // The RPC casts this with ::timestamptz, so junk would raise there instead
  // of being refused at the boundary that exists to refuse it.
  for (const bad of ["yesterday", "18/09/2026", "2026-13-45T00:00:00Z", "<script>"]) {
    const out = normaliseFields("journal", { title: "A piece", published_at: bad });
    assert.equal("published_at" in out, false, bad);
  }
});

test("the allowlist still refuses columns a client should not set", () => {
  const out = normaliseFields("journal", {
    title: "A piece",
    id: "00000000-0000-0000-0000-000000000000",
    owner_id: "someone-else",
    updated_at: "2020-01-01T00:00:00Z",
    created_at: "2020-01-01T00:00:00Z",
  });
  for (const forbidden of ["id", "owner_id", "updated_at", "created_at"]) {
    assert.equal(forbidden in out, false, forbidden);
  }
});

test("the importer still refuses a pasted publication date", () => {
  // Choosing a date is an editorial act in the Studio. A pasted document
  // deciding its own publication state is a different thing entirely, and
  // lib/studio-import.ts must keep saying no to it.
  const importer = readFileSync(new URL("../lib/studio-import.ts", import.meta.url), "utf8");
  const refused = importer.slice(importer.indexOf("REFUSED_KEYS"), importer.indexOf("]", importer.indexOf("REFUSED_KEYS")));
  assert.match(refused, /"published_at"/);
  assert.match(refused, /"status"/);
});

test("the migration only fills the date, never clears it", () => {
  const sql = readFileSync(
    new URL("../supabase/migrations/0007_author_publication_date.sql", import.meta.url),
    "utf8"
  );
  // coalesce(chosen, existing) — a NULL choice can never win over a stored date.
  assert.match(sql, /v_published := coalesce\(v_chosen, v_published\);/);
  assert.match(sql, /nullif\(btrim\(p_data ->> 'published_at'\), ''\)::timestamptz/);
  // Both entities, both the insert and the update path.
  assert.equal((sql.match(/coalesce\(v_chosen, v_published\)/g) ?? []).length, 4);
  // And the schema is untouched.
  assert.ok(!/alter table|add column|drop column/i.test(sql), "no schema change");
});
