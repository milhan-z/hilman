import { cache } from "react";
import { unstable_cache } from "next/cache";
import { mockJournal, mockPages, mockProjects, mockSettings, mockTags } from "./mock";
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
 * Caching has two layers, and they do different jobs:
 *
 *  - `cache()` from React dedupes within a single render. The site layout and
 *    the page it wraps both want settings and the home record; without this
 *    that is two round-trips for one answer.
 *  - `unstable_cache` keeps the answer between requests, tagged by what it was
 *    read from. A CMS save calls `revalidateTag`, so an edit is visible on the
 *    next request instead of after the ISR window expires. See CACHE_TAGS.
 */

/** Cache tags — the CMS invalidates these by name after a write. */
export const CACHE_TAGS = {
  settings: "settings",
  projects: "projects",
  journal: "journal",
  pages: "pages",
  tags: "tags",
  blocks: "blocks",
} as const;

/**
 * Wraps a read so it is memoised for the request *and* cached across requests
 * under `tags`. Cached entries never expire on a timer: they are dropped when
 * the CMS invalidates the tag, which is what makes an edit show up at once.
 */
function cached<A extends any[], R>(
  read: (...args: A) => Promise<R>,
  keyParts: string[],
  tags: string[]
): (...args: A) => Promise<R> {
  // Mock content is in-process already; caching it only adds a serialisation hop.
  if (usingMockContent) return cache(read) as (...args: A) => Promise<R>;
  return cache(unstable_cache(read, keyParts, { tags, revalidate: false })) as (
    ...args: A
  ) => Promise<R>;
}

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

async function fetchBlocks(ownerType: string, ownerId: string): Promise<Block[]> {
  const sb = createPublicClient();
  const res = await sb
    .from("content_blocks")
    .select("id, type, position, data")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("position");
  return (unwrap(`${ownerType} content`, res) as Block[] | null) ?? [];
}

/* ── Settings ──────────────────────────────────────────── */

async function readSettings(): Promise<Settings> {
  if (usingMockContent) return mockSettings;
  assertConfigured("site settings");
  const sb = createPublicClient();
  const res = await sb.from("settings").select("key, value");
  const rows = unwrap("site settings", res) ?? [];
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as Settings;
}
export const getSettings = cached(readSettings, ["settings"], [CACHE_TAGS.settings]);

/* ── Projects ──────────────────────────────────────────── */

/** The one query behind every project list — filtering happens in memory. */
async function readProjects(): Promise<Project[]> {
  if (usingMockContent) return mockProjects.filter((p) => p.status === "published");
  assertConfigured("works");
  const sb = createPublicClient();
  const res = await sb
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("status", "published")
    .order("sort_order");
  return (unwrap("works", res) ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
}
const allProjects = cached(readProjects, ["projects"], [CACHE_TAGS.projects, CACHE_TAGS.tags]);

export async function getProjects(filter?: { stream?: Stream; tag?: string }): Promise<Project[]> {
  let projects = await allProjects();
  if (filter?.stream) projects = projects.filter((p) => p.stream === filter.stream);
  if (filter?.tag) projects = projects.filter((p) => p.tags?.some((t) => t.slug === filter.tag));
  return projects;
}

export async function getFeaturedProjects(limit = 3): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.featured).slice(0, limit);
}

async function readProjectBySlug(slug: string): Promise<Project | null> {
  if (usingMockContent) {
    return mockProjects.find((p) => p.slug === slug && p.status === "published") ?? null;
  }
  assertConfigured("this project");
  const sb = createPublicClient();
  const res = await sb
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const data = unwrap("this project", res);
  if (!data) return null;
  const blocks = await fetchBlocks("project", (data as any).id);
  return { ...(data as any), tags: mapTags(data), blocks };
}
export const getProjectBySlug = cached(
  readProjectBySlug,
  ["project-by-slug"],
  [CACHE_TAGS.projects, CACHE_TAGS.blocks, CACHE_TAGS.tags]
);

/* ── Journal ───────────────────────────────────────────── */

async function readJournalPosts(): Promise<JournalPost[]> {
  if (usingMockContent) {
    return [...mockJournal]
      .filter((j) => j.status === "published")
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  }
  assertConfigured("the journal");
  const sb = createPublicClient();
  const res = await sb
    .from("journal_posts")
    .select(JOURNAL_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (unwrap("the journal", res) ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
}
export const getJournalPosts = cached(
  readJournalPosts,
  ["journal"],
  [CACHE_TAGS.journal, CACHE_TAGS.tags]
);

async function readJournalBySlug(slug: string): Promise<JournalPost | null> {
  if (usingMockContent) {
    return mockJournal.find((j) => j.slug === slug && j.status === "published") ?? null;
  }
  assertConfigured("this entry");
  const sb = createPublicClient();
  const res = await sb
    .from("journal_posts")
    .select(JOURNAL_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  const data = unwrap("this entry", res);
  if (!data) return null;
  const blocks = await fetchBlocks("journal", (data as any).id);
  return { ...(data as any), tags: mapTags(data), blocks };
}
export const getJournalBySlug = cached(
  readJournalBySlug,
  ["journal-by-slug"],
  [CACHE_TAGS.journal, CACHE_TAGS.blocks, CACHE_TAGS.tags]
);

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

async function readPage(slug: string): Promise<PageRow | null> {
  if (usingMockContent) {
    return mockPages.find((p) => p.slug === slug) ?? null;
  }
  assertConfigured(`the ${slug} page`);
  const sb = createPublicClient();
  const res = await sb.from("pages").select("*").eq("slug", slug).maybeSingle();
  const data = unwrap(`the ${slug} page`, res);
  if (!data) return null;
  const blocks = await fetchBlocks("page", (data as any).id);
  return { ...(data as any), blocks };
}
export const getPage = cached(readPage, ["page"], [CACHE_TAGS.pages, CACHE_TAGS.blocks]);

/* ── Tags ──────────────────────────────────────────────── */

async function readTags(): Promise<TagRow[]> {
  if (usingMockContent) return mockTags;
  assertConfigured("topics");
  const sb = createPublicClient();
  const res = await sb.from("tags").select("*").order("name");
  return (unwrap("topics", res) as TagRow[] | null) ?? [];
}
export const getTags = cached(readTags, ["tags"], [CACHE_TAGS.tags]);

/* ── Sitemap helpers ───────────────────────────────────── */

/**
 * Published slugs only. Throws like every other read — the sitemap decides
 * what to do with a failure, rather than shipping a stale or invented list.
 */
export async function getAllSlugs() {
  const [projects, journal] = await Promise.all([getProjects(), getJournalPosts()]);
  return {
    projects: projects.map((p) => p.slug),
    journal: journal.map((j) => j.slug),
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
