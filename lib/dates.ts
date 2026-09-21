/**
 * Editorial dates, read in one time zone everywhere.
 *
 * ── the bug this exists to end ──
 *
 * A journal entry showed **SEP 17** on its own page and **18 SEP** in the
 * listing, at the same moment, from the same row. Not a formatting
 * difference — a different calendar day.
 *
 * The cause was that nothing said which zone a date should be read in, so
 * each renderer used whatever it happened to be running in. The detail page
 * is a server component, so `toLocaleDateString` ran in Node and answered in
 * UTC. The listing renders inside `journal-explorer.tsx`, which is
 * `"use client"`, so the same call hydrated in the browser and answered in
 * the visitor's zone. For a timestamp of `2026-09-17T18:30:00Z` that is
 * literally "Sep 17" on one page and "Sep 18" on the other.
 *
 * It was never only a local quirk, either. Left alone, the date on a journal
 * entry would change depending on which country the reader opened it from,
 * and `groupByYear` — which called `getFullYear()` — could file a New Year's
 * Eve post under two different years for two different readers.
 *
 * ── the decision ──
 *
 * A publication date is an editorial fact, not a per-viewer one. This piece
 * was published on a particular day *where it was written*, and that is the
 * day it should say, to everybody, forever. So every reader of a date goes
 * through here, and here names the zone explicitly.
 *
 * `Intl.DateTimeFormat` with an explicit `timeZone` is deterministic: Node
 * and the browser return the same string for the same instant, which is what
 * makes the server render and the client hydration agree.
 *
 * Presentation may still differ — the detail page writes "Sep 18, 2026" and
 * the card stacks "18 / SEP / 2026". What may not differ is which day it is.
 */

/**
 * Where this notebook is written.
 *
 * Deliberately a fixed zone rather than the server's, the viewer's, or
 * whatever a build machine happens to be set to. Change this only if the
 * author moves and wants past dates reinterpreted — it applies to the whole
 * archive, not to new posts alone.
 */
export const AUTHOR_TIME_ZONE = "Asia/Jakarta";

/** Every formatter below is built once; constructing them is not cheap. */
const full = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTHOR_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
});

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTHOR_TIME_ZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const yearOnly = new Intl.DateTimeFormat("en-US", {
  timeZone: AUTHOR_TIME_ZONE,
  year: "numeric",
});

/** Guards against `new Date("")`, `new Date("not a date")` and nulls alike. */
function instant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sep 18, 2026" — the long form, for an entry header or a metadata line. */
export function formatDate(iso: string | null | undefined): string {
  const date = instant(iso);
  return date ? full.format(date) : "";
}

export interface DateParts {
  /** Zero-padded, because it sits in a fixed-width rail. */
  day: string;
  /** Upper-cased for the rail's mono treatment. */
  month: string;
  year: string;
}

/**
 * The same day, taken apart for a date rail.
 *
 * Read from one `formatToParts` call rather than from `getDate()` plus a
 * separate `toLocaleDateString()`: those are two different readings of the
 * same instant and can disagree with each other at a day boundary, which is
 * exactly the class of bug this module exists to remove.
 */
export function formatDateParts(iso: string | null | undefined): DateParts {
  const date = instant(iso);
  if (!date) return { day: "··", month: "———", year: "" };

  const found = parts.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    found.find((part) => part.type === type)?.value ?? "";

  return {
    day: pick("day"),
    month: pick("month").toUpperCase(),
    year: pick("year"),
  };
}

/**
 * The year an entry belongs to, for the listing's archive headings.
 *
 * Must come from the same zone as the date shown on the card beneath it, or
 * an entry can sit under one year while reading as another.
 */
export function yearOf(iso: string | null | undefined): string | null {
  const date = instant(iso);
  return date ? yearOnly.format(date) : null;
}

/** Today, where the author is. Used for the footer's copyright line. */
export function currentYear(): string {
  return yearOnly.format(new Date());
}

/**
 * An ISO instant for a calendar day the author picked, e.g. "2026-09-18".
 *
 * A bare `new Date("2026-09-18")` is parsed as UTC midnight, which in Jakarta
 * is 7am the same day — that happens to be harmless here, but only by luck,
 * and it breaks for zones behind UTC. Anchoring to midday in the author's
 * zone keeps the stored instant on the intended calendar day whichever way a
 * reader's offset falls.
 */
export function isoFromAuthorDate(day: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  if (!isRealCalendarDay(Number(y), Number(m), Number(d))) return null;

  // Asia/Jakarta is a fixed +07:00 with no daylight saving, so this offset is
  // correct year-round and needs no zone database at write time.
  const iso = `${y}-${m}-${d}T12:00:00+07:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Whether these three numbers name a day that exists.
 *
 * `new Date()` does not answer this. Given "2026-02-31" it does not fail — it
 * *overflows*, and hands back the 3rd of March. So a typo in a date picker
 * became a real publication date three days out, silently, with nothing
 * anywhere reporting a problem.
 *
 * Building the date and reading the components back is the check: a day that
 * comes out as a different day was never that day.
 */
export function isRealCalendarDay(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Whether two instants fall on the same calendar day for the author.
 *
 * The question the editor actually needs to ask before sending a publication
 * date: has the author changed the day, or is this just the stored instant
 * making a round trip through a date input? See publishedAtField() in
 * components/admin/editor-doc.ts.
 */
export function sameAuthorDay(
  iso: string | null | undefined,
  day: string | null | undefined
): boolean {
  const stored = authorDateInput(iso);
  return stored !== "" && stored === (day ?? "").trim();
}

/** The author-zone calendar day of an instant, as `yyyy-mm-dd` for a date input. */
export function authorDateInput(iso: string | null | undefined): string {
  const date = instant(iso);
  if (!date) return "";

  const found = parts.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    found.find((part) => part.type === type)?.value ?? "";

  const months: Record<string, string> = {
    Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
    Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
  };
  const month = months[pick("month")];
  return month ? `${pick("year")}-${month}-${pick("day")}` : "";
}
