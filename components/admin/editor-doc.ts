import type { Block, JournalPost, Project } from "@/lib/types";

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
  readingMinutes: string;
  status: "published" | "draft";
  featured: boolean;
  tagIds: string[];
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
    readingMinutes: initial?.reading_minutes ? String(initial.reading_minutes) : "3",
    status: initial?.status === "published" ? "published" : "draft",
    featured: initial?.featured ?? false,
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
 */
export function fieldsFor(
  kind: "project" | "journal",
  doc: EditorDoc,
  status: "published" | "draft" = doc.status
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
    };
  }
  return {
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    cover_public_id: doc.coverPublicId,
    status,
    featured: doc.featured,
    reading_minutes: doc.readingMinutes,
  };
}

/** Why this cannot be saved yet, in one sentence, or null. */
export function blockingReason(doc: EditorDoc): string | null {
  if (!doc.title.trim()) return "Add a title before saving.";
  if (!metaIsValid(doc)) return "The extra details aren't valid JSON yet.";
  return null;
}
