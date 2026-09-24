import { cache } from "react";
import { mockJournal, mockPages, mockProjects, mockSettings, mockTags } from "./mock";
import { isPublicJournalPost, isPublicProject, sanitizePublicSettings } from "./content-quality";
import { resolveProfileData } from "./profile";
import { createPublicClient } from "./supabase/public";
import { supabaseConfigured } from "./supabase/config";
import {
  Block,
  DEFAULT_SETTINGS,
  JournalPost,
  PageRow,
  Project,
  Settings,
  Stream,
  TagRow,
} from "./types";

/**
 * Public data layer.
 *
 * Two rules this file exists to enforce:
 *
 * 1. A failed query is never rendered as empty content. Every read checks
 *    `error` and throws, so "the database is unreachable" reaches the visitor
 *    as a load failure instead of looking like a portfolio nobody filled in.
 * 2. Mock content is a *development* convenience only. Serving lib/mock.ts
 *    from production put invented project slugs into the live sitemap while
 *    the real pages 404'd — so in production a missing Supabase config is an
 *    error, not a silent fallback.
 *
 * And one rule about cost: every reader is wrapped in React's `cache()`, so a
 * render asks the database each question once. A project page used to ask
 * six — its own row and blocks twice (once for the metadata, once for the
 * page), then every project and every block again for the previous/next
 * links — and the site layout asked for the Home page a second time on the
 * home page. The memo is scoped to one request, so nothing here outlives the
 * render that asked; ISR decides how long the answer is kept.
 */

const PROJECT_SELECT = "*, project_tags(tag:tags(*))";
const JOURNAL_SELECT = "*, journal_tags(tag:tags(*))";

/** Thrown when content could not be read. Pages turn this into a visible state. */
export class DataUnavailableError extends Error {
  readonly what: string;
  constructor(what: string, detail?: string) {
    super(`Could not load ${what}${detail ? `: ${detail}` : ""}`);
    this.name = "DataUnavailableError";
    this.what = what;
  }
}

/** Mock content stands in for a database only while developing locally. */
export const usingMockContent =
  !supabaseConfigured && process.env.NODE_ENV !== "production";

function assertConfigured(what: string) {
  if (supabaseConfigured || usingMockContent) return;
  // Production with no Supabase credentials: fail loudly rather than publish fiction.
  console.error(
    `[data] ${what}: Supabase is not configured in this environment. ` +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
  );
  throw new DataUnavailableError(what, "content source is not configured");
}

/**
 * Turns a Supabase error into a thrown DataUnavailableError, logging the
 * message (never the key or the URL) on the server.
 */
function unwrap<T>(what: string, res: { data: T | null; error: any }): T | null {
  if (res.error) {
    console.error(`[data] ${what} failed:`, res.error.message ?? res.error);
    throw new DataUnavailableError(what, res.error.message);
  }
  return res.data;
}

/** One batched read keeps list/detail quality checks consistent without N+1 queries. */
async function withBlocks<T extends { id: string }>(ownerType: "project" | "journal", rows: T[]): Promise<(T & { blocks: Block[] })[]> {
  if (!rows.length) return [];
  const sb = createPublicClient();
  const res = await sb.from("content_blocks").select("id, owner_id, type, position, data")
    .eq("owner_type", ownerType).in("owner_id", rows.map((row) => row.id)).order("position");
  const blocks = unwrap(`${ownerType} content`, res) ?? [];
  const byOwner = new Map<string, Block[]>();
  for (const block of blocks) {
    const grouped = byOwner.get(block.owner_id) ?? [];
    grouped.push(block as Block);
    byOwner.set(block.owner_id, grouped);
  }
  return rows.map((row) => ({ ...row, blocks: byOwner.get(row.id) ?? [] }));
}

/* ── Reader counts ─────────────────────────────────────── */

type ReadCounts = Map<string, number>;

const readKey = (kind: string, id: string) => `${kind}:${id}`;

/**
 * How many people have read each entry — migration 0013.
 *
 * The one read in this file that is allowed to fail quietly, and on purpose.
 * A count is a detail beside the work, not the work: a database that does not
 * have the table yet, or a hiccup on this one query, costs the numbers and
 * nothing else. Every other reader here throws instead, because a missing
 * project is worth an error and a missing "12 readers" is not.
 */
const getReadCounts = cache(async (): Promise<ReadCounts> => {
  const counts: ReadCounts = new Map();
  if (usingMockContent || !supabaseConfigured) return counts;
  const res = await createPublicClient().from("content_reads").select("owner_type, owner_id, reads");
  if (res.error) {
    console.warn("[data] reader counts unavailable:", res.error.message);
    return counts;
  }
  for (const row of res.data ?? []) counts.set(readKey(row.owner_type, row.owner_id), Number(row.reads) || 0);
  return counts;
});

function withReads<T extends { id: string }>(kind: "project" | "journal", rows: T[], counts: ReadCounts): T[] {
  if (!counts.size) return rows;
  return rows.map((row) => {
    const reads = counts.get(readKey(kind, row.id));
    return reads ? { ...row, reads } : row;
  });
}

/** List consumers do not need full body payloads in their client props. */
function withoutBlocks<T extends { blocks?: Block[] }>(item: T): T {
  const { blocks: _blocks, ...summary } = item;
  return summary as T;
}

/* ── Settings ──────────────────────────────────────────── */

export const getSettings = cache(async (): Promise<Settings> => {
  if (usingMockContent) return sanitizePublicSettings(mockSettings);
  assertConfigured("site settings");
  const sb = createPublicClient();
  const res = await sb.from("settings").select("key, value");
  const rows = unwrap("site settings", res) ?? [];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return sanitizePublicSettings({ ...DEFAULT_SETTINGS, ...map } as Settings);
});

/* ── Projects ──────────────────────────────────────────── */

/**
 * Every project a visitor may see, blocks included, in curated order.
 *
 * The lists and the detail page all read from this one answer. The detail
 * page needs the whole list anyway — for previous/next, and because the
 * public screen has to see a project's blocks to judge it — so reading the
 * one row again separately only doubled the work.
 */
const getPublicProjects = cache(async (): Promise<Project[]> => {
  let projects: Project[];
  if (usingMockContent) {
    projects = mockProjects.filter((p) => p.status === "published");
  } else {
    assertConfigured("works");
    const sb = createPublicClient();
    const [res, reads] = await Promise.all([
      sb.from("projects").select(PROJECT_SELECT).eq("status", "published").order("sort_order"),
      getReadCounts(),
    ]);
    const rows = (unwrap("works", res) ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
    projects = withReads("project", await withBlocks("project", rows), reads);
  }
  return projects.filter(isPublicProject);
});

export const getProjects = cache(async (filter?: { stream?: Stream; tag?: string }): Promise<Project[]> => {
  let projects = await getPublicProjects();
  if (filter?.stream) projects = projects.filter((p) => p.stream === filter.stream);
  if (filter?.tag) projects = projects.filter((p) => p.tags?.some((t) => t.slug === filter.tag));
  return projects.map(withoutBlocks);
});

export async function getFeaturedProjects(limit = 3): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.featured).slice(0, limit);
}

export const getProjectBySlug = cache(async (slug: string): Promise<Project | null> => {
  const projects = await getPublicProjects();
  return projects.find((p) => p.slug === slug) ?? null;
});

/* ── Journal ───────────────────────────────────────────── */

/** Every entry a visitor may see, blocks included, newest first. See getPublicProjects. */
const getPublicJournal = cache(async (): Promise<JournalPost[]> => {
  if (usingMockContent) {
    return [...mockJournal]
      .filter(isPublicJournalPost)
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  }
  assertConfigured("the journal");
  const sb = createPublicClient();
  const [res, reads] = await Promise.all([
    sb.from("journal_posts").select(JOURNAL_SELECT).eq("status", "published").order("published_at", { ascending: false }),
    getReadCounts(),
  ]);
  const rows = (unwrap("the journal", res) ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
  const posts: JournalPost[] = withReads("journal", await withBlocks("journal", rows), reads);
  return posts.filter(isPublicJournalPost);
});

export const getJournalPosts = cache(async (): Promise<JournalPost[]> => {
  return (await getPublicJournal()).map(withoutBlocks);
});

export const getJournalBySlug = cache(async (slug: string): Promise<JournalPost | null> => {
  const posts = await getPublicJournal();
  return posts.find((j) => j.slug === slug) ?? null;
});

export async function getRelatedJournal(post: JournalPost, limit = 2): Promise<JournalPost[]> {
  const all = await getJournalPosts();
  const tagSlugs = new Set((post.tags ?? []).map((t) => t.slug));
  return all
    .filter((j) => j.slug !== post.slug)
    .sort((a, b) => {
      const score = (j: JournalPost) => (j.tags ?? []).filter((t) => tagSlugs.has(t.slug)).length;
      return score(b) - score(a);
    })
    .slice(0, limit);
}

/* ── Pages ─────────────────────────────────────────────── */

/**
 * A page's structured data.
 *
 * Home, About and Connect are edited as forms and rendered from `data` alone,
 * so this no longer reads the page's content blocks: nothing public drew
 * them, and the site layout calls this on every route for the footer, which
 * made it a second round trip on every render for a list nobody used.
 */
export const getPage = cache(async (slug: string): Promise<PageRow | null> => {
  if (usingMockContent) {
    const page = mockPages.find((p) => p.slug === slug);
    return page ? { ...page, data: resolveProfileData(slug, page.data) } : null;
  }
  assertConfigured(`the ${slug} page`);
  const sb = createPublicClient();
  const res = await sb.from("pages").select("*").eq("slug", slug).maybeSingle();
  const data = unwrap(`the ${slug} page`, res);
  if (!data) return null;
  return { ...(data as any), data: resolveProfileData(slug, (data as any).data) };
});

/* ── Tags ──────────────────────────────────────────────── */

export const getTags = cache(async (): Promise<TagRow[]> => {
  if (usingMockContent) return mockTags;
  assertConfigured("topics");
  const sb = createPublicClient();
  const res = await sb.from("tags").select("*").order("name");
  return (unwrap("topics", res) as TagRow[] | null) ?? [];
});

/* ── Sitemap helpers ───────────────────────────────────── */

export interface PublishedEntry {
  slug: string;
  /** When the entry last changed, if the row says — for sitemap.xml. */
  lastModified?: string;
}

function publishedEntry(row: { slug: string; updated_at?: string; published_at: string | null }): PublishedEntry {
  return { slug: row.slug, lastModified: row.updated_at ?? row.published_at ?? undefined };
}

/**
 * Published slugs only. Throws like every other read — the sitemap decides
 * what to do with a failure, rather than shipping a stale or invented list.
 */
export async function getAllSlugs(): Promise<{ projects: PublishedEntry[]; journal: PublishedEntry[] }> {
  const [projects, journal] = await Promise.all([getProjects(), getJournalPosts()]);
  return {
    projects: projects.map(publishedEntry),
    journal: journal.map(publishedEntry),
  };
}

function mapTags(row: any): TagRow[] {
  const joins = row.project_tags ?? row.journal_tags ?? [];
  return joins.map((j: any) => j.tag).filter(Boolean);
}

/* ── Result-style loading ──────────────────────────────── */

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Runs a read and reports failure as a value instead of an exception.
 *
 * Pages use this so a database outage renders a visible "couldn't load"
 * state. Throwing all the way up also worked, but it failed the production
 * build during static generation — a transient network blip would have broken
 * the deploy rather than one page render.
 */
export async function load<T>(read: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Unknown error" };
  }
}

/** Falls back to a default value, but still says whether the read failed. */
export async function loadOr<T>(read: () => Promise<T>, fallback: T): Promise<[T, boolean]> {
  const res = await load(read);
  return res.ok ? [res.value, true] : [fallback, false];
}
