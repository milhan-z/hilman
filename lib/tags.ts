import { slugify } from "./utils";
import type { TagRow } from "./types";

/**
 * Tags typed the way you would say them: "coding, design".
 *
 * The editor's tag field is one line of text. Every comma-separated name in
 * it either *is* a tag already — matched by name, ignoring case, or by the
 * slug it would get — or becomes one when the entry is saved. There is no
 * separate trip to Taxonomy to make a tag first.
 *
 * ── where a new tag is made ──
 *
 * On the server, in /api/studio/sync, just before the save — never in the
 * browser. A save can sit in the offline queue for hours, and "coding" typed
 * on a phone in a tunnel has no id to send, so the queued payload carries the
 * *name* (`tagNames`) and the server turns names into ids when the save
 * arrives. That is also what makes it safe to retry: the second delivery
 * finds the tag the first one created, gets the same id, and the save
 * function's idempotency digest matches.
 *
 * Everything here is pure, so the editor and the server match names by one
 * rule, and the rule is tested without either of them.
 */

/** Long enough for "Creative Coding", short enough to stay a tag. */
export const MAX_TAG_NAME = 40;
/** Per entry. A card shows three; twenty is already a list, not tags. */
export const MAX_TAGS = 20;

/** The slug a name would be stored under — the same rule Taxonomy uses. */
export const tagSlug = (name: string): string => slugify(name);

/** One name, tidied: inner whitespace collapsed, trimmed, capped. */
export function cleanTagName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_NAME).trim();
}

export interface ParsedTags {
  /** In the order typed, one per slug. */
  names: string[];
  /** Pieces that cannot become a tag: nothing in them a slug can keep. */
  unusable: string[];
  /** Whether names past MAX_TAGS were left off. */
  truncated: boolean;
}

/**
 * "coding, Design,  ,design, UI/UX" → ["coding", "Design", "UI/UX"].
 *
 * Commas separate, and so do line breaks, because a list pasted from notes
 * arrives one per line. A name that repeats another one — "design" after
 * "Design" — is the same tag and is kept once, as first typed.
 */
export function parseTagInput(text: string): ParsedTags {
  return normaliseTagNames(text.split(/[,\n]/));
}

/** Names already split apart: cleaned, deduplicated by slug, capped. */
export function normaliseTagNames(pieces: readonly string[]): ParsedTags {
  const names: string[] = [];
  const unusable: string[] = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const piece of pieces) {
    const name = cleanTagName(piece);
    if (!name) continue;
    const slug = tagSlug(name);
    if (!slug) {
      unusable.push(name);
      continue;
    }
    if (seen.has(slug)) continue;
    if (names.length >= MAX_TAGS) {
      truncated = true;
      continue;
    }
    seen.add(slug);
    names.push(name);
  }
  return { names, unusable, truncated };
}

export interface MatchedTags {
  /** Tags that already exist, in the order named. */
  ids: string[];
  /** Names with no tag yet — these are created on save. */
  fresh: string[];
}

/**
 * Which names are tags already.
 *
 * By name first, ignoring case, so "ui/ux" finds a tag called "UI/UX" whose
 * slug was chosen by hand; then by slug, so "Design " and "design" find
 * `design`. Only a name that matches neither is new.
 */
export function matchTags(names: string[], known: Pick<TagRow, "id" | "slug" | "name">[]): MatchedTags {
  const find = tagFinder(known);
  const ids: string[] = [];
  const fresh: string[] = [];

  for (const name of names) {
    const hit = find(name);
    if (hit) {
      if (!ids.includes(hit.id)) ids.push(hit.id);
    } else if (!fresh.some((other) => tagSlug(other) === tagSlug(name))) {
      fresh.push(name);
    }
  }
  return { ids, fresh };
}

/** The lookup matchTags() describes, built once for a list of tags. */
function tagFinder<T extends Pick<TagRow, "id" | "slug" | "name">>(known: T[]) {
  const byName = new Map(known.map((tag) => [tag.name.trim().toLowerCase(), tag]));
  const bySlug = new Map(known.map((tag) => [tag.slug, tag]));
  return (name: string): T | undefined => byName.get(name.toLowerCase()) ?? bySlug.get(tagSlug(name));
}

/** What the tag field shows for a document: its tags, then the new ones. */
export function tagInputText(
  tagIds: string[],
  fresh: string[] | undefined,
  known: Pick<TagRow, "id" | "name">[]
): string {
  const byId = new Map(known.map((tag) => [tag.id, tag.name]));
  const names = tagIds.map((id) => byId.get(id)).filter((name): name is string => Boolean(name));
  return [...names, ...(fresh ?? [])].join(", ");
}

/** A document's tags, as the editor keeps them. */
export interface DocTags {
  tagIds: string[];
  /** Absent rather than empty — see EditorDoc.newTags. */
  newTags?: string[];
}

export interface TagInputItem {
  /** The stored name of an existing tag; a new one as it was typed. */
  name: string;
  /** The existing tag's id, or null for a name that becomes a tag on save. */
  id: string | null;
}

export interface ReadTagInput {
  /** In the order typed, one per tag. */
  items: TagInputItem[];
  unusable: string[];
  truncated: boolean;
}

/**
 * A line of typing, read against the tags that exist — what the field shows
 * under itself, and what the document is told.
 */
export function readTagInput(text: string, known: Pick<TagRow, "id" | "slug" | "name">[]): ReadTagInput {
  const parsed = parseTagInput(text);
  const find = tagFinder(known);
  const items: TagInputItem[] = [];
  const seen = new Set<string>();

  for (const name of parsed.names) {
    const hit = find(name);
    // Two spellings can land on one tag — "ui/ux" by name, "UI UX" by slug.
    const key = hit ? `tag:${hit.id}` : `new:${tagSlug(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(hit ? { name: hit.name, id: hit.id } : { name, id: null });
  }
  return { items, unusable: parsed.unusable, truncated: parsed.truncated };
}

/**
 * What a line of typing means for the document: the tags it names that
 * exist, and the names that will become tags on save. `newTags` is left out
 * when there are none, so a document whose tags were only ever picked from
 * existing ones serialises exactly as it did before this field existed.
 */
export function tagsFromInput(text: string, known: Pick<TagRow, "id" | "slug" | "name">[]): DocTags {
  const { items } = readTagInput(text, known);
  const tagIds = items.flatMap((item) => (item.id ? [item.id] : []));
  const newTags = items.flatMap((item) => (item.id ? [] : [item.name]));
  return newTags.length ? { tagIds, newTags } : { tagIds };
}

/**
 * The same line, tidied for when the field is left: in the order typed,
 * duplicates and empty pieces gone, and every existing tag spelt the way it
 * is stored — "DESIGN" becomes "Design" — so what you see is what you get.
 */
export function tidyTagInput(text: string, known: Pick<TagRow, "id" | "slug" | "name">[]): string {
  return readTagInput(text, known)
    .items.map((item) => item.name)
    .join(", ");
}

/**
 * Whether two tag states name the same tags. Order is not a difference: an
 * entry's tags are a set, and a fold that appends an id is not an edit.
 */
export function sameTags(a: DocTags, b: DocTags): boolean {
  const set = (value: string[] | undefined) => [...(value ?? [])].sort().join("\u0000");
  return set(a.tagIds) === set(b.tagIds) && set(a.newTags) === set(b.newTags);
}

/**
 * Folds names that have since become tags into the ids.
 *
 * After a save creates "coding", the editor still holds it as a name. Once
 * the tag list is read again this swaps the name for the id, so the next save
 * carries an id like every other tag and the field stops calling it new.
 *
 * Returns the very same object when there is nothing to fold, and otherwise
 * keeps every key where it was, so a snapshot of the result compares cleanly
 * with a snapshot of the same fold applied to the same document elsewhere.
 */
export function settleNewTags<T extends DocTags>(doc: T, known: Pick<TagRow, "id" | "slug" | "name">[]): T {
  if (!doc.newTags?.length) return doc;
  const { ids, fresh } = matchTags(doc.newTags, known);
  if (ids.length === 0) return doc;
  const { newTags: _settled, ...rest } = doc;
  const tagIds = [...new Set([...doc.tagIds, ...ids])];
  return (fresh.length ? { ...rest, tagIds, newTags: fresh } : { ...rest, tagIds }) as unknown as T;
}

/**
 * A queued payload's `tagNames`, as the server will accept them — or why not.
 *
 * Checked by the sync contract before anything is sent or written; see
 * describeMalformedMutation() in lib/studio-sync-contract.ts.
 */
export function describeBadTagNames(value: unknown): string | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) return "New tags must be a list of names.";
  if (value.length > MAX_TAGS) return `An entry can have at most ${MAX_TAGS} tags.`;
  for (const name of value) {
    if (typeof name !== "string") return "A new tag must be a name.";
    if (/[,\n]/.test(name)) return "A tag name can't contain a comma — that separates tags.";
    const clean = cleanTagName(name);
    if (!clean || clean !== name.trim()) return `"${String(name).slice(0, 60)}" is not a tag name as written.`;
    if (!tagSlug(clean)) return `"${clean}" needs at least one letter or number to be a tag.`;
  }
  return null;
}

/* ── making the new ones, on the server ───────────────────── */

/** The two things resolution needs from the database. */
export interface TagStore {
  list(): Promise<Pick<TagRow, "id" | "slug" | "name">[]>;
  /** Inserts, ignoring any slug that already exists. */
  insert(rows: { name: string; slug: string }[]): Promise<void>;
}

/**
 * Whether a failure to make the tags will happen again as written — in which
 * case the save goes back to the editor instead of round the queue.
 *
 * A database refusal carries its Postgres code: not the owner, a rejected
 * value. A dropped connection comes back from postgrest-js as an error whose
 * code is "", and that is worth another try. Only resolveTagIds' own "still
 * no tag" has no code at all, and it will refuse the same way next time.
 */
export function tagFailureIsPermanent(cause: unknown): boolean {
  const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
  if (typeof code !== "string") return true;
  return ["42501", "23514", "22023", "23505"].includes(code);
}

/**
 * The ids a save should carry: the ones it named, plus a tag for every new
 * name — made if it is not there yet.
 *
 * Creating is `insert … on conflict do nothing` followed by a fresh read, so
 * two saves naming the same new tag at once both end up with the one row
 * rather than one of them failing on the unique slug. If a name still has no
 * tag after that, something refused the write, and the save stops here
 * instead of quietly dropping a tag the author typed.
 */
export async function resolveTagIds(
  store: TagStore,
  tagIds: string[],
  tagNames: string[] | undefined
): Promise<string[]> {
  const names = normaliseTagNames(tagNames ?? []).names;
  if (names.length === 0) return tagIds;

  let matched = matchTags(names, await store.list());
  if (matched.fresh.length > 0) {
    await store.insert(matched.fresh.map((name) => ({ name, slug: tagSlug(name) })));
    matched = matchTags(names, await store.list());
    if (matched.fresh.length > 0) {
      throw new Error(`Couldn't create the tag ${matched.fresh.map((name) => `"${name}"`).join(", ")}.`);
    }
  }
  return [...new Set([...tagIds, ...matched.ids])];
}
