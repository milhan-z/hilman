import { isRealCalendarDay } from "./dates";
import { slugify } from "./utils";

/**
 * What a project row and a journal row are made of.
 *
 * There are now two doors into the same save: the form post from the editor,
 * and the queued JSON the phone sends to /api/studio/sync once it is back on a
 * network. They have to agree on every default and every trim, or a save made
 * offline would land subtly different from the same save made online. This is
 * the one definition both of them use.
 */

export interface ContentPayload {
  [column: string]: unknown;
  title: string;
  slug: string;
  status: "published" | "draft";
  featured: boolean;
}

const text = (value: unknown): string => (value == null ? "" : String(value)).trim();

/** A checkbox arrives as "on" from a form and as true from JSON. */
const flag = (value: unknown): boolean =>
  value === true || value === "on" || value === "true" || value === 1;

const status = (value: unknown): "published" | "draft" =>
  value === "published" ? "published" : "draft";

/**
 * A publication date the author chose, or nothing at all.
 *
 * `normaliseFields` is an allowlist that rebuilds the payload from known keys,
 * which is what stops a client inventing columns — so a new field has to be
 * added here on purpose, and this one carries real authority: it overrides a
 * date the database would otherwise own.
 *
 * Two rules. It has to parse as an instant, because the value is handed to
 * `::timestamptz` in the RPC and anything else would raise there instead of
 * being refused here. And an empty or unparseable value yields *no key at
 * all* rather than null: the migration reads a missing key as "leave the
 * existing date alone", and null would read as "clear it".
 */
function publishedAt(value: unknown): { published_at?: string } {
  const raw = text(value);
  if (!raw) return {};

  // `new Date("2026-02-31")` does not fail; it overflows into the 3rd of
  // March. So the calendar components are checked before the string is parsed
  // at all, and a day that does not exist is dropped rather than quietly
  // becoming a different one. The RPC casts this with ::timestamptz, which
  // would happily have stored the wrong date.
  const parts = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/.exec(raw);
  if (!parts || !isRealCalendarDay(Number(parts[1]), Number(parts[2]), Number(parts[3]))) {
    return {};
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? {} : { published_at: date.toISOString() };
}

export function normaliseProjectFields(raw: Record<string, unknown>): ContentPayload {
  const title = text(raw.title);
  return {
    title,
    slug: slugify(text(raw.slug)) || slugify(title),
    subtitle: text(raw.subtitle),
    excerpt: text(raw.excerpt),
    stream: text(raw.stream) || "visual-design",
    year: text(raw.year),
    status: status(raw.status),
    featured: flag(raw.featured),
    sort_order: text(raw.sort_order),
    thumbnail_public_id: text(raw.thumbnail_public_id),
    cover_public_id: text(raw.cover_public_id),
    meta: isPlainObject(raw.meta) ? raw.meta : {},
    ...publishedAt(raw.published_at),
  };
}

export function normaliseJournalFields(raw: Record<string, unknown>): ContentPayload {
  const title = text(raw.title);
  return {
    title,
    slug: slugify(text(raw.slug)) || slugify(title),
    excerpt: text(raw.excerpt),
    cover_public_id: text(raw.cover_public_id),
    status: status(raw.status),
    featured: flag(raw.featured),
    reading_minutes: text(raw.reading_minutes),
    ...publishedAt(raw.published_at),
  };
}

export function normaliseFields(
  kind: "project" | "journal",
  raw: Record<string, unknown>
): ContentPayload {
  return kind === "project" ? normaliseProjectFields(raw) : normaliseJournalFields(raw);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
