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
 * With Supabase configured → real queries (RLS exposes published rows only).
 * Without → mock content from lib/mock.ts so the site runs with zero setup.
 */

const PROJECT_SELECT = "*, project_tags(tag:tags(*))";
const JOURNAL_SELECT = "*, journal_tags(tag:tags(*))";

function mapTags(row: any): TagRow[] {
  const joins = row.project_tags ?? row.journal_tags ?? [];
  return joins.map((j: any) => j.tag).filter(Boolean);
}

async function fetchBlocks(ownerType: string, ownerId: string): Promise<Block[]> {
  const sb = createPublicClient();
  const { data } = await sb
    .from("content_blocks")
    .select("id, type, position, data")
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId)
    .order("position");
  return (data as Block[]) ?? [];
}

/* ── Settings ──────────────────────────────────────────── */

export async function getSettings(): Promise<Settings> {
  if (!supabaseConfigured) return mockSettings;
  const sb = createPublicClient();
  const { data } = await sb.from("settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return { ...DEFAULT_SETTINGS, ...map } as Settings;
}

/* ── Projects ──────────────────────────────────────────── */

export async function getProjects(filter?: { stream?: Stream; tag?: string }): Promise<Project[]> {
  let projects: Project[];
  if (!supabaseConfigured) {
    projects = mockProjects.filter((p) => p.status === "published");
  } else {
    const sb = createPublicClient();
    const { data } = await sb
      .from("projects")
      .select(PROJECT_SELECT)
      .eq("status", "published")
      .order("sort_order");
    projects = (data ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
  }
  if (filter?.stream) projects = projects.filter((p) => p.stream === filter.stream);
  if (filter?.tag) projects = projects.filter((p) => p.tags?.some((t) => t.slug === filter.tag));
  return projects;
}

export async function getFeaturedProjects(limit = 3): Promise<Project[]> {
  const all = await getProjects();
  return all.filter((p) => p.featured).slice(0, limit);
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  if (!supabaseConfigured) {
    return mockProjects.find((p) => p.slug === slug && p.status === "published") ?? null;
  }
  const sb = createPublicClient();
  const { data } = await sb
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  const blocks = await fetchBlocks("project", data.id);
  return { ...(data as any), tags: mapTags(data), blocks };
}

/* ── Journal ───────────────────────────────────────────── */

export async function getJournalPosts(): Promise<JournalPost[]> {
  if (!supabaseConfigured) {
    return [...mockJournal]
      .filter((j) => j.status === "published")
      .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  }
  const sb = createPublicClient();
  const { data } = await sb
    .from("journal_posts")
    .select(JOURNAL_SELECT)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return (data ?? []).map((row: any) => ({ ...row, tags: mapTags(row) }));
}

export async function getJournalBySlug(slug: string): Promise<JournalPost | null> {
  if (!supabaseConfigured) {
    return mockJournal.find((j) => j.slug === slug && j.status === "published") ?? null;
  }
  const sb = createPublicClient();
  const { data } = await sb
    .from("journal_posts")
    .select(JOURNAL_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!data) return null;
  const blocks = await fetchBlocks("journal", data.id);
  return { ...(data as any), tags: mapTags(data), blocks };
}

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

export async function getPage(slug: string): Promise<PageRow | null> {
  if (!supabaseConfigured) {
    return mockPages.find((p) => p.slug === slug) ?? null;
  }
  const sb = createPublicClient();
  const { data } = await sb.from("pages").select("*").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const blocks = await fetchBlocks("page", data.id);
  return { ...(data as any), blocks };
}

/* ── Tags ──────────────────────────────────────────────── */

export async function getTags(): Promise<TagRow[]> {
  if (!supabaseConfigured) return mockTags;
  const sb = createPublicClient();
  const { data } = await sb.from("tags").select("*").order("name");
  return (data as TagRow[]) ?? [];
}

/* ── Sitemap helpers ───────────────────────────────────── */

export async function getAllSlugs() {
  const [projects, journal] = await Promise.all([getProjects(), getJournalPosts()]);
  return {
    projects: projects.map((p) => p.slug),
    journal: journal.map((j) => j.slug),
  };
}
