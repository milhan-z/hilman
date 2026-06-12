"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { destroyAsset } from "@/lib/cloudinary-server";
import { slugify } from "@/lib/utils";
import type { Block, OwnerType } from "@/lib/types";

/**
 * All CMS mutations. Every action runs with the caller's session —
 * RLS rejects writes from anyone who isn't authenticated, so authorization
 * is enforced at the database even if a route slipped past middleware.
 */

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
}

const ok: ActionState = { status: "success" };
const fail = (message: string): ActionState => ({ status: "error", message });

function revalidateSite() {
  for (const p of ["/", "/works", "/journal", "/about", "/connect", "/lab"]) {
    revalidatePath(p);
  }
  revalidatePath("/works/[slug]", "page");
  revalidatePath("/journal/[slug]", "page");
}

/* ── auth ──────────────────────────────────────────────── */

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail("Wrong key for this door. Check your email & password.");
  redirect("/admin");
}

export async function signOut() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/* ── blocks (shared) ───────────────────────────────────── */

async function saveBlocks(ownerType: OwnerType, ownerId: string, blocks: Block[]) {
  const supabase = createServerSupabase();
  const { error: delErr } = await supabase
    .from("content_blocks")
    .delete()
    .eq("owner_type", ownerType)
    .eq("owner_id", ownerId);
  if (delErr) throw new Error(delErr.message);
  if (blocks.length) {
    const { error } = await supabase.from("content_blocks").insert(
      blocks.map((b, i) => ({
        owner_type: ownerType,
        owner_id: ownerId,
        type: b.type,
        position: i,
        data: b.data ?? {},
      }))
    );
    if (error) throw new Error(error.message);
  }
}

function parseJson<T>(raw: FormDataEntryValue | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(String(raw)) as T) : fallback;
  } catch {
    return fallback;
  }
}

/* ── projects ──────────────────────────────────────────── */

export async function saveProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createServerSupabase();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("A project needs a title.");
  const status = formData.get("status") === "published" ? "published" : "draft";

  const row: Record<string, any> = {
    title,
    slug: slugify(String(formData.get("slug") ?? "")) || slugify(title),
    subtitle: String(formData.get("subtitle") ?? "").trim() || null,
    excerpt: String(formData.get("excerpt") ?? "").trim() || null,
    stream: String(formData.get("stream") ?? "visual-design"),
    year: Number(formData.get("year")) || null,
    status,
    featured: formData.get("featured") === "on",
    sort_order: Number(formData.get("sort_order")) || 0,
    thumbnail_public_id: String(formData.get("thumbnail_public_id") ?? "").trim() || null,
    cover_public_id: String(formData.get("cover_public_id") ?? "").trim() || null,
    meta: parseJson(formData.get("meta"), {}),
  };

  try {
    let projectId = id;
    if (id) {
      if (status === "published") {
        const { data: existing } = await supabase
          .from("projects").select("published_at").eq("id", id).single();
        if (!existing?.published_at) row.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from("projects").update(row).eq("id", id);
      if (error) return fail(error.message);
    } else {
      if (status === "published") row.published_at = new Date().toISOString();
      const { data, error } = await supabase.from("projects").insert(row).select("id").single();
      if (error) return fail(error.message);
      projectId = data.id;
    }

    await saveBlocks("project", projectId, parseJson<Block[]>(formData.get("blocks"), []));

    const tagIds = parseJson<string[]>(formData.get("tag_ids"), []);
    await supabase.from("project_tags").delete().eq("project_id", projectId);
    if (tagIds.length) {
      const { error } = await supabase
        .from("project_tags")
        .insert(tagIds.map((tag_id) => ({ project_id: projectId, tag_id })));
      if (error) return fail(error.message);
    }

    revalidateSite();
    if (!id) redirect(`/admin/projects/${projectId}`);
    return ok;
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    return fail(e.message ?? "Save failed.");
  }
}

export async function deleteProject(id: string) {
  const supabase = createServerSupabase();
  await supabase.from("content_blocks").delete().eq("owner_type", "project").eq("owner_id", id);
  await supabase.from("projects").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/projects");
}

/* ── journal ───────────────────────────────────────────── */

export async function saveJournal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createServerSupabase();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("An entry needs a title.");
  const status = formData.get("status") === "published" ? "published" : "draft";

  const row: Record<string, any> = {
    title,
    slug: slugify(String(formData.get("slug") ?? "")) || slugify(title),
    excerpt: String(formData.get("excerpt") ?? "").trim() || null,
    cover_public_id: String(formData.get("cover_public_id") ?? "").trim() || null,
    status,
    featured: formData.get("featured") === "on",
    reading_minutes: Math.max(1, Number(formData.get("reading_minutes")) || 1),
  };

  try {
    let postId = id;
    if (id) {
      if (status === "published") {
        const { data: existing } = await supabase
          .from("journal_posts").select("published_at").eq("id", id).single();
        if (!existing?.published_at) row.published_at = new Date().toISOString();
      }
      const { error } = await supabase.from("journal_posts").update(row).eq("id", id);
      if (error) return fail(error.message);
    } else {
      if (status === "published") row.published_at = new Date().toISOString();
      const { data, error } = await supabase.from("journal_posts").insert(row).select("id").single();
      if (error) return fail(error.message);
      postId = data.id;
    }

    await saveBlocks("journal", postId, parseJson<Block[]>(formData.get("blocks"), []));

    const tagIds = parseJson<string[]>(formData.get("tag_ids"), []);
    await supabase.from("journal_tags").delete().eq("journal_id", postId);
    if (tagIds.length) {
      const { error } = await supabase
        .from("journal_tags")
        .insert(tagIds.map((tag_id) => ({ journal_id: postId, tag_id })));
      if (error) return fail(error.message);
    }

    revalidateSite();
    if (!id) redirect(`/admin/journal/${postId}`);
    return ok;
  } catch (e: any) {
    if (e?.digest?.startsWith?.("NEXT_REDIRECT")) throw e;
    return fail(e.message ?? "Save failed.");
  }
}

export async function deleteJournal(id: string) {
  const supabase = createServerSupabase();
  await supabase.from("content_blocks").delete().eq("owner_type", "journal").eq("owner_id", id);
  await supabase.from("journal_posts").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/journal");
}

/* ── pages ─────────────────────────────────────────────── */

export async function savePage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createServerSupabase();
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  let data: Record<string, any>;
  try {
    data = JSON.parse(String(formData.get("data") ?? "{}"));
  } catch {
    return fail("The data field isn't valid JSON — fix it and save again.");
  }
  const { error } = await supabase
    .from("pages")
    .upsert({ slug, title, data }, { onConflict: "slug" });
  if (error) return fail(error.message);
  revalidateSite();
  return ok;
}

export async function quickUpdateItem(
  kind: "project" | "journal",
  id: string,
  updates: {
    title: string;
    slug?: string;
    status: "published" | "draft";
    featured: boolean;
    stream?: string;
    year?: number | null;
    sort_order?: number;
  }
): Promise<ActionState> {
  const supabase = createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";
  
  const title = updates.title.trim();
  if (!title) return fail("A title is required.");

  const row: Record<string, any> = {
    title,
    slug: slugify(updates.slug || "") || slugify(title),
    status: updates.status,
    featured: updates.featured,
  };

  if (kind === "project") {
    if (updates.stream) row.stream = updates.stream;
    row.year = updates.year ?? null;
    if (updates.sort_order !== undefined) row.sort_order = updates.sort_order;
  }

  try {
    if (updates.status === "published") {
      const { data: existing } = await supabase
        .from(table)
        .select("published_at")
        .eq("id", id)
        .single();
      if (!existing?.published_at) {
        row.published_at = new Date().toISOString();
      }
    }

    const { error } = await supabase.from(table).update(row).eq("id", id);
    if (error) return fail(error.message);

    revalidateSite();
    return ok;
  } catch (e: any) {
    return fail(e.message ?? "Quick edit failed.");
  }
}

export async function bulkUpdateItems(
  kind: "project" | "journal",
  ids: string[],
  updates: { status: "published" | "draft" }
): Promise<ActionState> {
  const supabase = createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";

  try {
    const row: Record<string, any> = {
      status: updates.status,
    };

    if (updates.status === "published") {
      const { data: existing, error: fetchErr } = await supabase
        .from(table)
        .select("id, published_at")
        .in("id", ids);

      if (fetchErr) return fail(fetchErr.message);

      for (const item of existing || []) {
        const itemRow: Record<string, any> = { status: updates.status };
        if (!item.published_at) {
          itemRow.published_at = new Date().toISOString();
        }
        await supabase.from(table).update(itemRow).eq("id", item.id);
      }
    } else {
      const { error } = await supabase.from(table).update(row).in("id", ids);
      if (error) return fail(error.message);
    }

    revalidateSite();
    return ok;
  } catch (e: any) {
    return fail(e.message ?? "Bulk update failed.");
  }
}

export async function bulkDeleteItems(
  kind: "project" | "journal",
  ids: string[]
): Promise<ActionState> {
  const supabase = createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";

  try {
    // Delete associated content blocks first
    const { error: blockErr } = await supabase
      .from("content_blocks")
      .delete()
      .eq("owner_type", kind)
      .in("owner_id", ids);

    if (blockErr) return fail(blockErr.message);

    // Delete records
    const { error } = await supabase.from(table).delete().in("id", ids);
    if (error) return fail(error.message);

    revalidateSite();
    return ok;
  } catch (e: any) {
    return fail(e.message ?? "Bulk delete failed.");
  }
}

/* ── taxonomy ──────────────────────────────────────────── */

export async function createTag(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = createServerSupabase();
  await supabase.from("tags").insert({ name, slug: slugify(name) });
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function deleteTag(id: string) {
  const supabase = createServerSupabase();
  await supabase.from("tags").delete().eq("id", id);
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function createCategory(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const stream = String(formData.get("stream") ?? "") || null;
  const supabase = createServerSupabase();
  await supabase.from("categories").insert({
    name,
    slug: slugify(name),
    stream,
    description: String(formData.get("description") ?? "").trim() || null,
  });
  revalidatePath("/admin/taxonomy");
}

export async function deleteCategory(id: string) {
  const supabase = createServerSupabase();
  await supabase.from("categories").delete().eq("id", id);
  revalidatePath("/admin/taxonomy");
}

/* ── media ─────────────────────────────────────────────── */

export async function recordMedia(asset: {
  public_id: string;
  kind: "image" | "file";
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  folder?: string;
}) {
  const supabase = createServerSupabase();
  const { error } = await supabase.from("media").upsert(
    {
      public_id: asset.public_id,
      kind: asset.kind,
      format: asset.format ?? null,
      width: asset.width ?? null,
      height: asset.height ?? null,
      bytes: asset.bytes ?? null,
      folder: asset.folder ?? null,
    },
    { onConflict: "public_id" }
  );
  revalidatePath("/admin/media");
  return error ? fail(error.message) : ok;
}

export async function updateMediaMeta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("media")
    .update({
      alt: String(formData.get("alt") ?? "").trim() || null,
      title: String(formData.get("title") ?? "").trim() || null,
      folder: String(formData.get("folder") ?? "").trim() || null,
    })
    .eq("id", String(formData.get("id")));
  revalidatePath("/admin/media");
  return error ? fail(error.message) : ok;
}

export async function deleteMedia(id: string, publicId: string, kind: "image" | "file") {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await destroyAsset(publicId, kind === "file" ? "raw" : "image");
  await supabase.from("media").delete().eq("id", id);
  revalidatePath("/admin/media");
}

/* ── settings ──────────────────────────────────────────── */

export async function saveSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = createServerSupabase();
  const entries: { key: string; value: any }[] = [];

  const roles = String(formData.get("hero_roles") ?? "")
    .split("\n").map((r) => r.trim()).filter(Boolean);
  entries.push({ key: "hero_roles", value: roles });

  for (const key of ["socials", "nav"]) {
    try {
      entries.push({ key, value: JSON.parse(String(formData.get(key) ?? "[]")) });
    } catch {
      return fail(`"${key}" isn't valid JSON.`);
    }
  }

  const { error } = await supabase.from("settings").upsert(entries);
  if (error) return fail(error.message);
  revalidateSite();
  return ok;
}

/* ── messages ──────────────────────────────────────────── */

export async function deleteMessage(id: string) {
  const supabase = createServerSupabase();
  await supabase.from("messages").delete().eq("id", id);
  revalidatePath("/admin/messages");
}

/* ── command palette ───────────────────────────────────── */

export interface CommandIndex {
  projects: { id: string; title: string; status: string }[];
  journal: { id: string; title: string; status: string }[];
  pages: { id: string; title: string; slug: string }[];
}

/** Lightweight content index for the ⌘K palette — titles only, newest first. */
export async function getCommandIndex(): Promise<CommandIndex> {
  const supabase = createServerSupabase();
  const [projects, journal, pages] = await Promise.all([
    supabase.from("projects").select("id, title, status").order("updated_at", { ascending: false }).limit(50),
    supabase.from("journal_posts").select("id, title, status").order("updated_at", { ascending: false }).limit(50),
    supabase.from("pages").select("id, title, slug").order("slug"),
  ]);
  return {
    projects: projects.data ?? [],
    journal: journal.data ?? [],
    pages: pages.data ?? [],
  };
}
