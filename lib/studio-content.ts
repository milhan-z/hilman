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
