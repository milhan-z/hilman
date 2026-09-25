import type { Block, JournalPost, Project, TagRow } from "@/lib/types";
import { readTimeMinutesNow } from "./read-time";
import { authorDateInput, isoFromAuthorDate, sameAuthorDay } from "@/lib/dates";
import { settleNewTags } from "@/lib/tags";

/**
 * Everything one project or journal entry is, while it is being edited.
 *
 * Previously this was seventeen separate useState calls in live-editor.tsx,
 * which meant every component that wanted to show or change a field took
 * seventeen props — the metadata bar took forty. One object with one patch
 * function lets the editor, the metadata sheet and the desktop settings panel
 * share a shape instead of a prop list, and makes the dirty check a single
 * comparison.
 *
 * `status` lives here because it is part of the payload the server saves. It
 * is deliberately *not* editable as a form field: publishing is a decision the
 * bottom action bar owns, with a quality gate behind it, not a dropdown you
 * can brush past on the way to the tags.
 */
export interface EditorDoc {
  title: string;
  slug: string;
  subtitle: string;
  stream: string;
  excerpt: string;
  coverPublicId: string;
  thumbnailPublicId: string;
  year: string;
  sortOrder: string;
  /** The project `meta` column, as JSON text, so invalid input is still typed. */
  rawMeta: string;
  /**
   * No `readingMinutes`. It is derived from the words — see lib/read-time.ts —
   * and a field here would be a second, editable answer to a question the
   * content already answers.
   */
  status: "published" | "draft";
  featured: boolean;
  /**
   * The publication date, as the calendar day the author picked
   * (`yyyy-mm-dd`), or empty to let the database decide.
   *
   * The database sets `published_at = now()` the first time something is
   * published and keeps it thereafter, which is right for "I published this
   * today" and wrong for everything else: a piece written last month, a date
   * corrected after the fact, an entry backdated to when the thing actually
   * happened. This is the override for those.
   *
   * A calendar day rather than an instant, because that is the editorial
   * fact. It becomes an instant at the save boundary — see
   * isoFromAuthorDate() in lib/dates.ts for why it anchors at midday.
   */
  publishedOn: string;
  /**
   * The instant already stored on the row, exactly as the database has it.
   *
   * Carried through the editor untouched and never shown. It is here to answer
   * one question at save time: is the day in the picker a *decision*, or just
   * the stored instant making a round trip through a date input?
   *
   * Without it there was no way to tell, and every save re-sent the picker's
   * day as a fresh midday instant. An entry stored at 2026-09-17T18:30:00Z
   * became 2026-09-18T05:00:00Z the next time anybody fixed a typo in it —
   * same calendar day, so nothing on the site looked different, and the exact
   * moment it was published was quietly gone.
   */
  publishedAt: string | null;
  tagIds: string[];
  /**
   * Tags typed into the tag field that do not exist yet, by name. They become
   * real tags on the server when this is saved — see lib/tags.ts — and are
   * folded into `tagIds` once the tag list has been read back.
   *
   * Left out, never empty. The recovery copy and the dirty check both compare
   * serialised documents, so a document with no new tags has to serialise
   * exactly as it did before this field existed.
   */
  newTags?: string[];
  blocks: Block[];
}

export type EditorPatch = (patch: Partial<EditorDoc>) => void;

export function docFromInitial(initial: (Project & JournalPost) | null): EditorDoc {
  return {
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    subtitle: initial?.subtitle ?? "",
    stream: initial?.stream ?? "visual-design",
    excerpt: initial?.excerpt ?? "",
    coverPublicId: initial?.cover_public_id ?? "",
    thumbnailPublicId: initial?.thumbnail_public_id ?? "",
    year: initial?.year ? String(initial.year) : "",
    sortOrder: initial?.sort_order ? String(initial.sort_order) : "0",
    rawMeta: JSON.stringify(initial?.meta ?? {}, null, 2),
    status: initial?.status === "published" ? "published" : "draft",
    featured: initial?.featured ?? false,
    publishedOn: authorDateInput(initial?.published_at),
    publishedAt: initial?.published_at ?? null,
    tagIds: (initial?.tags ?? []).map((tag) => tag.id),
    blocks: initial?.blocks ?? [],
  };
}

/** The `meta` column, or an empty object while the JSON is mid-edit. */
export function parsedMeta(doc: EditorDoc): Record<string, unknown> {
  try {
    const parsed = JSON.parse(doc.rawMeta || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function metaIsValid(doc: EditorDoc): boolean {
  if (!doc.rawMeta.trim()) return true;
  try {
    const parsed = JSON.parse(doc.rawMeta);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

/**
 * The scalar columns, named exactly as the save actions and /api/studio/sync
 * name them. One definition, so a save made offline lands identically to the
 * same save made online.
 *
 * `readingMinutes` is the journal's reading time when the caller has already
 * counted it — the editor does, with readTimeMinutesFor(), because a document
 * with Custom HTML needs the parser fetched first. Without it the count is made
 * here, which is always possible for a document with no markup in it.
 */
export function fieldsFor(
  kind: "project" | "journal",
  doc: EditorDoc,
  status: "published" | "draft" = doc.status,
  readingMinutes?: number
): Record<string, unknown> {
  if (kind === "project") {
    return {
      title: doc.title,
      slug: doc.slug,
      subtitle: doc.subtitle,
      excerpt: doc.excerpt,
      stream: doc.stream,
      year: doc.year,
      status,
      featured: doc.featured,
      sort_order: doc.sortOrder,
      thumbnail_public_id: doc.thumbnailPublicId,
      cover_public_id: doc.coverPublicId,
      meta: parsedMeta(doc),
      ...publishedAtField(doc),
    };
  }
  return {
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    cover_public_id: doc.coverPublicId,
    status,
    featured: doc.featured,
    // Derived at the save boundary, because the public list pages read the
    // column and are served without blocks to count. The boundary counts again
    // regardless, so a save made offline before the parser ever arrived — the
    // one case where there is no number here — still lands with the right one.
    reading_minutes:
      readingMinutes ?? readTimeMinutesNow({ excerpt: doc.excerpt, blocks: doc.blocks }),
    ...publishedAtField(doc),
  };
}

/**
 * The publication date, only when the author actually changed it.
 *
 * Three intentions, and they are not the same thing:
 *
 *   untouched  the picker shows the day the stored instant falls on, because
 *              that is what it was loaded with. Send nothing. The database
 *              keeps the exact timestamp it already has, to the second.
 *
 *   chosen     the day in the picker is a different day from the stored one.
 *              Send it, anchored at midday in the author's zone.
 *
 *   empty      nothing is set. Send nothing, and the database does what it has
 *              always done: stamp `now()` on first publish and keep it after.
 *
 * The field is *absent* rather than null in the two "send nothing" cases. A
 * null would read as "clear the date" — a genuinely destructive instruction,
 * and never something an untouched form field should be able to express.
 *
 * Distinguishing untouched from chosen is the point. Both look identical in
 * the input, and conflating them meant every save re-anchored the stored
 * instant to midday: 18:30 on the 17th became 05:00 on the 18th, which is the
 * same day in Jakarta and so passed every check the site had.
 */
function publishedAtField(doc: EditorDoc): { published_at?: string } {
  const chosen = (doc.publishedOn ?? "").trim();
  if (!chosen) return {};
  // The stored instant already falls on this day, so nothing was decided here.
  if (sameAuthorDay(doc.publishedAt, chosen)) return {};

  const iso = isoFromAuthorDate(chosen);
  return iso ? { published_at: iso } : {};
}

/**
 * Whether the picker is showing something other than what is stored.
 *
 * The editor uses this for its "Reset" control and its hint, so both describe
 * what will actually happen rather than what the field looks like.
 */
export function publicationDateChanged(doc: EditorDoc): boolean {
  const chosen = (doc.publishedOn ?? "").trim();
  if (!chosen) return false;
  return !sameAuthorDay(doc.publishedAt, chosen);
}

/**
 * settleNewTags(), for a document that has been serialised.
 *
 * The editor keeps what it has written down and what the site has as
 * snapshot strings. When a name becomes an id in the document it has to
 * become one in those too, or the editor would report the fold as an edit.
 * The same fold over the same keys gives the same string on both sides.
 */
export function settleSnapshot(snapshot: string, known: Pick<TagRow, "id" | "slug" | "name">[]): string {
  if (!snapshot.includes('"newTags"')) return snapshot;
  try {
    const parsed = JSON.parse(snapshot) as EditorDoc;
    const settled = settleNewTags(parsed, known);
    return settled === parsed ? snapshot : JSON.stringify(settled);
  } catch {
    return snapshot;
  }
}

/** Why this cannot be saved yet, in one sentence, or null. */
export function blockingReason(doc: EditorDoc): string | null {
  if (!doc.title.trim()) return "Add a title before saving.";
  if (!metaIsValid(doc)) return "The extra details aren't valid JSON yet.";
  return null;
}
