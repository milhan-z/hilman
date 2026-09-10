"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkOwner } from "@/lib/owner";
import { destroyAsset } from "@/lib/cloudinary-server";
import { slugify } from "@/lib/utils";
import type { Block } from "@/lib/types";

/**
 * All CMS mutations.
 *
 * Two invariants:
 *  - Every action starts with checkOwner(). Being signed in is not enough;
 *    ownership is a row in `site_owners` that this app cannot grant itself.
 *  - Content saves go through save_project() / save_journal_post(), which run
 *    metadata, blocks, and tags inside one database transaction. A failure
 *    leaves the previously published version untouched.
 */

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  /** Set on a successful save so the editor can show "saved at …" honestly. */
  savedAt?: string;
  /** Id of the row that was written — used when the caller stays on the page. */
  id?: string;
}

const ok = (id?: string): ActionState => ({
  status: "success",
  savedAt: new Date().toISOString(),
  ...(id ? { id } : {}),
});
const fail = (message: string): ActionState => ({ status: "error", message });

function revalidateSite() {
  for (const p of ["/", "/works", "/journal", "/about", "/connect", "/lab"]) {
    revalidatePath(p);
  }
  revalidatePath("/works/[slug]", "page");
  revalidatePath("/journal/[slug]", "page");
  revalidatePath("/sitemap.xml");
}

/** Guard for actions that return an ActionState. */
async function guard(): Promise<ActionState | null> {
  const check = await checkOwner();
  return check.ok ? null : fail(check.message);
}

/** Guard for void actions — throws so the caller cannot ignore it. */
async function guardOrThrow() {
  const check = await checkOwner();
  if (!check.ok) throw new Error(check.message);
}

/* ── payload parsing ───────────────────────────────────── */

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Strict JSON parse. The old version swallowed a broken payload and returned
 * a default — for a blocks field that meant "save an empty body over the
 * article you were editing". Now the save is refused instead.
 */
function parseJson<T>(raw: FormDataEntryValue | null, label: string, fallback: T): Parsed<T> {
  const text = raw == null ? "" : String(raw).trim();
  if (!text) return { ok: true, value: fallback };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (e: any) {
    return { ok: false, error: `${label} isn't valid JSON — nothing was saved. (${e.message})` };
  }
}

function validateBlocks(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return "The content payload isn't a list of blocks.";
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") return `Block ${i + 1} is malformed.`;
    const type = (b as any).type;
    if (typeof type !== "string" || !type.trim()) return `Block ${i + 1} has no type.`;
    const data = (b as any).data;
    if (data != null && (typeof data !== "object" || Array.isArray(data)))
      return `Block ${i + 1} has a malformed payload.`;
  }
  return null;
}

function validateTagIds(ids: unknown): string | null {
  if (!Array.isArray(ids)) return "The tag list is malformed.";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (ids.some((id) => typeof id !== "string" || !uuid.test(id)))
    return "The tag list contains an invalid id.";
  return null;
}

/* ── auth ──────────────────────────────────────────────── */

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return fail("Wrong key for this door. Check your email & password.");

  // Signing in is not the same as owning the site — say so at the door rather
  // than letting every screen fail one by one.
  const check = await checkOwner();
  if (!check.ok) {
    await supabase.auth.signOut();
    return fail(check.message);
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/** Turns a Postgres error from the save functions into something readable. */
function saveError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "That slug is already taken — pick another one.";
  if (error.code === "42501") return "This account isn't allowed to edit the site.";
  if (error.code === "P0002") return "That item no longer exists — it may have been deleted.";
  if (error.code === "PGRST202")
    return "The save function is missing from the database. Apply supabase/migrations/0004_atomic_saves.sql.";
  return error.message;
}

/* ── projects ──────────────────────────────────────────── */

export async function saveProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("A project needs a title.");

  const meta = parseJson<Record<string, any>>(formData.get("meta"), "The meta field", {});
  if (!meta.ok) return fail(meta.error);
  const blocks = parseJson<Block[]>(formData.get("blocks"), "The content", []);
  if (!blocks.ok) return fail(blocks.error);
  const tagIds = parseJson<string[]>(formData.get("tag_ids"), "The tag list", []);
  if (!tagIds.ok) return fail(tagIds.error);

  const blockError = validateBlocks(blocks.value);
  if (blockError) return fail(`${blockError} Nothing was saved.`);
  const tagError = validateTagIds(tagIds.value);
  if (tagError) return fail(`${tagError} Nothing was saved.`);

  const payload = {
    title,
    slug: slugify(String(formData.get("slug") ?? "")) || slugify(title),
    subtitle: String(formData.get("subtitle") ?? "").trim(),
    excerpt: String(formData.get("excerpt") ?? "").trim(),
    stream: String(formData.get("stream") ?? "visual-design"),
    year: String(formData.get("year") ?? "").trim(),
    status: formData.get("status") === "published" ? "published" : "draft",
    featured: formData.get("featured") === "on",
    sort_order: String(formData.get("sort_order") ?? "").trim(),
    thumbnail_public_id: String(formData.get("thumbnail_public_id") ?? "").trim(),
    cover_public_id: String(formData.get("cover_public_id") ?? "").trim(),
    meta: meta.value,
  };

  const { data, error } = await supabase.rpc("save_project", {
    p_id: id || null,
    p_data: payload,
    p_blocks: blocks.value,
    p_tag_ids: tagIds.value,
  });
  if (error) return fail(saveError(error));

  revalidateSite();
  revalidatePath("/admin/projects");
  // `stay` lets a widget save without navigating away from where it lives.
  if (!id && formData.get("stay") !== "1") redirect(`/admin/projects/${data}`);
  return ok(String(data ?? id));
}

export async function deleteProject(id: string) {
  await guardOrThrow();
  const supabase = createServerSupabase();
  await supabase.from("content_blocks").delete().eq("owner_type", "project").eq("owner_id", id);
  await supabase.from("projects").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/projects");
}

/* ── journal ───────────────────────────────────────────── */

export async function saveJournal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("An entry needs a title.");

  const blocks = parseJson<Block[]>(formData.get("blocks"), "The content", []);
  if (!blocks.ok) return fail(blocks.error);
  const tagIds = parseJson<string[]>(formData.get("tag_ids"), "The tag list", []);
  if (!tagIds.ok) return fail(tagIds.error);

  const blockError = validateBlocks(blocks.value);
  if (blockError) return fail(`${blockError} Nothing was saved.`);
  const tagError = validateTagIds(tagIds.value);
  if (tagError) return fail(`${tagError} Nothing was saved.`);

  const payload = {
    title,
    slug: slugify(String(formData.get("slug") ?? "")) || slugify(title),
    excerpt: String(formData.get("excerpt") ?? "").trim(),
    cover_public_id: String(formData.get("cover_public_id") ?? "").trim(),
    status: formData.get("status") === "published" ? "published" : "draft",
    featured: formData.get("featured") === "on",
    reading_minutes: String(formData.get("reading_minutes") ?? "").trim(),
  };

  const { data, error } = await supabase.rpc("save_journal_post", {
    p_id: id || null,
    p_data: payload,
    p_blocks: blocks.value,
    p_tag_ids: tagIds.value,
  });
  if (error) return fail(saveError(error));

  revalidateSite();
  revalidatePath("/admin/journal");
  // `stay` lets a widget save without navigating away from where it lives.
  if (!id && formData.get("stay") !== "1") redirect(`/admin/journal/${data}`);
  return ok(String(data ?? id));
}

export async function deleteJournal(id: string) {
  await guardOrThrow();
  const supabase = createServerSupabase();
  await supabase.from("content_blocks").delete().eq("owner_type", "journal").eq("owner_id", id);
  await supabase.from("journal_posts").delete().eq("id", id);
  revalidateSite();
  redirect("/admin/journal");
}

/* ── pages ─────────────────────────────────────────────── */

/**
 * Saves one structured page from a real form instead of a JSON textarea.
 * `fields` is already-shaped data from the profile/page editors.
 */
export async function savePageData(
  slug: string,
  title: string,
  data: Record<string, any>
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (!slug.trim()) return fail("Missing page slug.");
  if (!title.trim()) return fail("A page needs a title.");

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("pages")
    .upsert({ slug: slug.trim(), title: title.trim(), data }, { onConflict: "slug" });
  if (error) return fail(saveError(error));
  revalidateSite();
  revalidatePath(`/admin/pages/${slug}`);
  return ok();
}

/**
 * Creates any missing core page rows and leaves existing ones alone.
 * This is what the Pages screen offers instead of `npm run seed`, which
 * deletes all content and settings before inserting demo material.
 */
export async function initCorePages(): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const { error } = await supabase.rpc("ensure_core_pages");
  if (error) {
    if (error.code === "PGRST202") {
      // Migration 0004 not applied — do the same thing with a plain upsert.
      const { error: upsertErr } = await supabase.from("pages").upsert(
        [
          { slug: "home", title: "Home", data: {} },
          { slug: "about", title: "About", data: {} },
          { slug: "connect", title: "Connect", data: {} },
        ],
        { onConflict: "slug", ignoreDuplicates: true }
      );
      if (upsertErr) return fail(saveError(upsertErr));
    } else {
      return fail(saveError(error));
    }
  }
  revalidatePath("/admin/pages");
  revalidateSite();
  return ok();
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
  const denied = await guard();
  if (denied) return denied;

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
      const { data: existing, error: readErr } = await supabase
        .from(table)
        .select("published_at")
        .eq("id", id)
        .single();
      if (readErr) return fail(saveError(readErr));
      if (!existing?.published_at) {
        row.published_at = new Date().toISOString();
      }
    }

    const { error } = await supabase.from(table).update(row).eq("id", id);
    if (error) return fail(saveError(error));

    revalidateSite();
    return ok();
  } catch (e: any) {
    return fail(e.message ?? "Quick edit failed.");
  }
}

export async function bulkUpdateItems(
  kind: "project" | "journal",
  ids: string[],
  updates: { status: "published" | "draft" }
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";

  try {
    if (updates.status === "published") {
      const { data: existing, error: fetchErr } = await supabase
        .from(table)
        .select("id, published_at")
        .in("id", ids);
      if (fetchErr) return fail(saveError(fetchErr));

      const never = (existing ?? []).filter((r) => !r.published_at).map((r) => r.id);
      const already = (existing ?? []).filter((r) => r.published_at).map((r) => r.id);

      if (never.length) {
        const { error } = await supabase
          .from(table)
          .update({ status: "published", published_at: new Date().toISOString() })
          .in("id", never);
        if (error) return fail(saveError(error));
      }
      if (already.length) {
        const { error } = await supabase
          .from(table)
          .update({ status: "published" })
          .in("id", already);
        if (error) return fail(saveError(error));
      }
    } else {
      const { error } = await supabase.from(table).update({ status: "draft" }).in("id", ids);
      if (error) return fail(saveError(error));
    }

    revalidateSite();
    return ok();
  } catch (e: any) {
    return fail(e.message ?? "Bulk update failed.");
  }
}

export async function bulkDeleteItems(
  kind: "project" | "journal",
  ids: string[]
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";

  try {
    const { error: blockErr } = await supabase
      .from("content_blocks")
      .delete()
      .eq("owner_type", kind)
      .in("owner_id", ids);
    if (blockErr) return fail(saveError(blockErr));

    const { error } = await supabase.from(table).delete().in("id", ids);
    if (error) return fail(saveError(error));

    revalidateSite();
    return ok();
  } catch (e: any) {
    return fail(e.message ?? "Bulk delete failed.");
  }
}

/* ── taxonomy ──────────────────────────────────────────── */

export async function createTag(formData: FormData) {
  await guardOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = createServerSupabase();
  await supabase.from("tags").insert({ name, slug: slugify(name) });
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function deleteTag(id: string) {
  await guardOrThrow();
  const supabase = createServerSupabase();
  await supabase.from("tags").delete().eq("id", id);
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function createCategory(formData: FormData) {
  await guardOrThrow();
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
  await guardOrThrow();
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
}): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

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
  return error ? fail(error.message) : ok();
}

export async function updateMediaMeta(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

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
  return error ? fail(error.message) : ok();
}

export interface MediaReference {
  kind: string;
  ref_id: string;
  label: string;
}

/** Where an asset is still used. Empty list means it is safe to delete. */
export async function getMediaReferences(publicId: string): Promise<MediaReference[]> {
  const check = await checkOwner();
  if (!check.ok) return [];
  const supabase = createServerSupabase();
  const { data, error } = await supabase.rpc("media_references", { p_public_id: publicId });
  if (error) {
    console.error("[media] reference lookup failed:", error.message);
    return [];
  }
  return (data as MediaReference[]) ?? [];
}

export async function deleteMedia(
  id: string,
  publicId: string,
  kind: "image" | "file",
  options?: { force?: boolean }
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  if (!options?.force) {
    const refs = await getMediaReferences(publicId);
    if (refs.length) {
      return fail(
        `Still used by ${refs.length} item${refs.length > 1 ? "s" : ""}: ` +
          refs
            .slice(0, 3)
            .map((r) => r.label)
            .join(", ") +
          (refs.length > 3 ? "…" : "") +
          ". Remove it there first, or confirm to delete anyway."
      );
    }
  }

  const supabase = createServerSupabase();
  try {
    await destroyAsset(publicId, kind === "file" ? "raw" : "image");
  } catch (e: any) {
    return fail(`Cloudinary refused the delete: ${e.message ?? e}`);
  }
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) return fail(error.message);
  revalidatePath("/admin/media");
  revalidateSite();
  return ok();
}

/* ── settings ──────────────────────────────────────────── */

/** Structured settings save used by the form editor. */
export async function saveSettingsData(input: {
  hero_roles: string[];
  socials: { label: string; url: string }[];
  nav: { label: string; href: string }[];
}): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const bad = input.socials.find((s) => !s.label.trim() || !s.url.trim());
  if (bad) return fail("Every link needs both a label and a URL.");

  const supabase = createServerSupabase();
  const { error } = await supabase.from("settings").upsert([
    { key: "hero_roles", value: input.hero_roles },
    { key: "socials", value: input.socials },
    { key: "nav", value: input.nav },
  ]);
  if (error) return fail(saveError(error));
  revalidateSite();
  revalidatePath("/admin/settings");
  return ok();
}

/* ── messages ──────────────────────────────────────────── */

export type MessageStatus = "new" | "read" | "actioned" | "archived";

/**
 * Moves a message along its lifecycle. Archiving is not deleting — the note
 * stays readable, which is the difference the old "Dismiss Message" button
 * quietly erased.
 */
export async function setMessageStatus(
  id: string,
  status: MessageStatus
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("messages")
    .update({
      status,
      handled_at: status === "new" ? null : new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    if (error.code === "42703") {
      return fail(
        "The inbox status columns are missing. Apply supabase/migrations/0003_owner_and_integrity.sql."
      );
    }
    return fail(saveError(error));
  }
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
  return ok();
}

/** Permanent. The UI asks first and names what is being destroyed. */
export async function deleteMessage(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = createServerSupabase();
  const { error } = await supabase.from("messages").delete().eq("id", id);
  if (error) return fail(saveError(error));
  revalidatePath("/admin/messages");
  revalidatePath("/admin");
  return ok();
}

/* ── command palette ───────────────────────────────────── */

export interface CommandIndex {
  projects: { id: string; title: string; status: string }[];
  journal: { id: string; title: string; status: string }[];
  pages: { id: string; title: string; slug: string }[];
}

/** Lightweight content index for the ⌘K palette — titles only, newest first. */
export async function getCommandIndex(): Promise<CommandIndex> {
  const check = await checkOwner();
  if (!check.ok) return { projects: [], journal: [], pages: [] };

  const supabase = createServerSupabase();
  const [projects, journal, pages] = await Promise.all([
    supabase.from("projects").select("id, title, status").order("updated_at", { ascending: false }).limit(50),
    supabase.from("journal_posts").select("id, title, status").order("updated_at", { ascending: false }).limit(50),
    supabase.from("pages").select("id, title, slug").order("slug"),
  ]);
  for (const res of [projects, journal, pages]) {
    if (res.error) console.error("[palette] index query failed:", res.error.message);
  }
  return {
    projects: projects.data ?? [],
    journal: journal.data ?? [],
    pages: pages.data ?? [],
  };
}
