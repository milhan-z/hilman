"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkOwner } from "@/lib/owner";
import { destroyAsset } from "@/lib/cloudinary-server";
import { slugify } from "@/lib/utils";
import type { Block, TagRow } from "@/lib/types";
import { getJournalQualityIssues, getProjectQualityIssues, type ContentQualityInput } from "@/lib/content-quality";
import {
  checkPin,
  GLOBAL_MAX_ATTEMPTS,
  LOCKOUT_MS,
  MAX_ATTEMPTS,
  NO_ATTEMPTS,
} from "@/lib/studio-pin";
import {
  addressFromHeaders,
  attemptKeyForAddress,
  GLOBAL_KEY,
  reservePinAttempt,
  clearPinAttempts,
} from "@/lib/studio-pin-store";

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

/* ── publication rules ─────────────────────────────────── */

function publicationError(kind: "project" | "journal", content: ContentQualityInput): string | null {
  const issues = kind === "project" ? getProjectQualityIssues(content) : getJournalQualityIssues(content);
  return issues.length ? `${issues.map((issue) => issue.message).join(" ")} You can still save this as a draft.` : null;
}

/** Quick and bulk publishing must check the same full content as the editor. */
async function readPublicationBlocks(supabase: Awaited<ReturnType<typeof createServerSupabase>>, kind: "project" | "journal", ids: string[]) {
  const { data, error } = await supabase.from("content_blocks").select("owner_id, type, position, data")
    .eq("owner_type", kind).in("owner_id", ids).order("position");
  if (error) throw new Error(saveError(error));
  const grouped = new Map<string, Block[]>();
  for (const block of data ?? []) {
    const blocks = grouped.get(block.owner_id) ?? [];
    blocks.push(block as unknown as Block);
    grouped.set(block.owner_id, blocks);
  }
  return grouped;
}

/* ── auth ──────────────────────────────────────────────── */

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createServerSupabase();
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

/**
 * Wrong-PIN attempts are counted twice: once for the address that is knocking,
 * and once for the door as a whole. Per-address alone is beatable by spreading
 * guesses around; the whole-door count catches that, at the cost of being able
 * to lock the owner out too — the email form below is the way back in.
 *
 * The counts live in the database rather than in this module. See
 * lib/studio-pin-store.ts for why that distinction matters on Vercel.
 */
export async function signInWithPin(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const requestHeaders = await headers();
  const addressKey = attemptKeyForAddress(addressFromHeaders(requestHeaders));
  const entered = String(formData.get("pin") ?? "");

  // Decided before the counter is touched. A missing STUDIO_PIN and a typo of
  // the wrong length are both "not a guess": there is nothing to count and
  // nothing to lock, and counting them would let a fat finger spend the
  // owner's own allowance.
  const probe = checkPin({ entered, expected: process.env.STUDIO_PIN, attempts: NO_ATTEMPTS });
  if (!probe.gate.ok && (probe.gate.reason === "unconfigured" || probe.gate.reason === "malformed")) {
    return fail(probe.gate.message);
  }

  // Counted atomically, and counted *before* the comparison. Reading a count,
  // deciding in JavaScript and writing it back is how two simultaneous guesses
  // used to cost one — see lib/studio-pin-store.ts.
  const reservation = await reservePinAttempt([
    { key: addressKey, max: MAX_ATTEMPTS, lockoutMs: LOCKOUT_MS },
    { key: GLOBAL_KEY, max: GLOBAL_MAX_ATTEMPTS, lockoutMs: LOCKOUT_MS },
  ]);

  // The limiter is unreachable, so nothing can be promised about how many
  // guesses have already been made. Refuse the shortcut rather than open it on
  // trust; the email form below is unaffected and is the way in.
  if (reservation.status === "unavailable") return fail(reservation.message);

  if (reservation.status === "locked") {
    const minutes = Math.max(1, Math.ceil((reservation.lockedUntil - Date.now()) / 60_000));
    return fail(
      `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or sign in with your email and password.`
    );
  }

  if (!probe.gate.ok) {
    const left = reservation.remaining;
    return fail(`That PIN doesn't open this door. ${left} ${left === 1 ? "try" : "tries"} left.`);
  }

  // The right PIN forgives the wrong ones, on this address and on the door as
  // a whole. Not awaited for its answer: the owner is already through, and a
  // counter that failed to clear expires on its own.
  await clearPinAttempts([addressKey, GLOBAL_KEY]);

  // The PIN only decides whether to attempt the real sign-in. The credentials
  // stay on the server and the browser still receives an ordinary Supabase
  // session, so RLS and is_site_owner() remain the actual enforcement.
  const email = String(process.env.STUDIO_OWNER_EMAIL ?? "").trim();
  const password = String(process.env.STUDIO_OWNER_PASSWORD ?? "");
  if (!email || !password) {
    return fail(
      "The PIN was right, but the studio account isn't configured here. Set STUDIO_OWNER_EMAIL and STUDIO_OWNER_PASSWORD in this environment."
    );
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error("[studio] PIN sign-in could not reach the owner account:", error.message);
    return fail("The PIN was right, but that studio account could not sign in. Check the credentials in .env.local.");
  }

  const check = await checkOwner();
  if (!check.ok) {
    await supabase.auth.signOut();
    return fail(check.message);
  }
  redirect("/admin");
}

export async function signOut() {
  const supabase = await createServerSupabase();
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

/**
 * Content saves are not here any more. Both editors write through the outbox
 * in lib/studio-local/ and out through /api/studio/sync, so that an unreliable
 * connection cannot turn a save into a lost one. What remains in this file are
 * the mutations that only make sense with a server in reach: deletes, quick
 * status changes, taxonomy, media and the inbox.
 */
/**
 * Deletes an article and its body together, or neither.
 *
 * This was two statements in two round trips with neither result looked at.
 * If the blocks went and the row did not -- a constraint, a dropped connection
 * -- the article stayed on the site with its entire body removed, and this
 * function redirected as though it had worked. Reproduced with twenty blocks
 * against a real PostgreSQL.
 *
 * `delete_content` does both inside one transaction and checks ownership
 * itself, so the database enforces the rule rather than trusting that the
 * caller already did. `redirect()` throws by design in Next, so it stays
 * outside the part that can fail.
 */
async function deleteContent(entity: "project" | "journal", id: string): Promise<string | null> {
  await guardOrThrow();
  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc("delete_content", { p_entity: entity, p_id: id });
  if (error) {
    if (error.code === "PGRST202") {
      return "The delete function is missing from the database. Apply supabase/migrations/0012_atomic_content_delete.sql.";
    }
    return saveError(error);
  }
  revalidateSite();
  return null;
}

export async function deleteProject(id: string): Promise<ActionState | void> {
  const problem = await deleteContent("project", id);
  if (problem) return fail(problem);
  redirect("/admin/projects");
}

/* ── journal ───────────────────────────────────────────── */

export async function deleteJournal(id: string): Promise<ActionState | void> {
  const problem = await deleteContent("journal", id);
  if (problem) return fail(problem);
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

  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

export async function bulkUpdateItems(
  kind: "project" | "journal",
  ids: string[],
  updates: { status: "published" | "draft" }
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const supabase = await createServerSupabase();
  const table = kind === "project" ? "projects" : "journal_posts";

  try {
    if (updates.status === "published") {
      const { data: existing, error: fetchErr } = await supabase
        .from(table)
        .select("*")
        .in("id", ids);
      if (fetchErr) return fail(saveError(fetchErr));
      const blocks = await readPublicationBlocks(supabase, kind, ids);
      for (const item of existing ?? []) {
        const issue = publicationError(kind, { ...item, blocks: blocks.get(item.id) ?? [] });
        if (issue) return fail(`${item.title}: ${issue} Nothing in this batch was published.`);
      }

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

  const supabase = await createServerSupabase();
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

/**
 * The tag list, read again.
 *
 * The editor asks after a save that named new tags: the save made them on
 * the server, and this is how the editor learns their ids and stops calling
 * them new. Null when it can't be read — the names stay names until the next
 * try, and saving them again finds the same tags.
 */
export async function listTags(): Promise<TagRow[] | null> {
  const check = await checkOwner();
  if (!check.ok) return null;
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from("tags").select("id, slug, name").order("name");
  return error ? null : ((data ?? []) as TagRow[]);
}

export async function createTag(formData: FormData) {
  await guardOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const supabase = await createServerSupabase();
  await supabase.from("tags").insert({ name, slug: slugify(name) });
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function deleteTag(id: string) {
  await guardOrThrow();
  const supabase = await createServerSupabase();
  await supabase.from("tags").delete().eq("id", id);
  revalidatePath("/admin/taxonomy");
  revalidateSite();
}

export async function createCategory(formData: FormData) {
  await guardOrThrow();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const stream = String(formData.get("stream") ?? "") || null;
  const supabase = await createServerSupabase();
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
  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

/**
 * Where an asset is still used, or an admission that we could not find out.
 *
 * The distinction is the entire point. This used to return `MediaReference[]`
 * and answer `[]` both when the asset was genuinely unused *and* when the
 * lookup failed -- a database error, or a caller who turned out not to be the
 * owner. The one caller read an empty list as "safe to delete", so an outage
 * in the check became permission to destroy the thing it was checking.
 *
 * Not being able to establish that something is unreferenced is not evidence
 * that it is.
 */
export type MediaUsage =
  | { status: "known"; references: MediaReference[] }
  | { status: "unknown"; reason: string };

export async function getMediaReferences(publicId: string): Promise<MediaUsage> {
  const check = await checkOwner();
  if (!check.ok) return { status: "unknown", reason: check.message };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("media_references", { p_public_id: publicId });
  if (error) {
    console.error("[media] reference lookup failed:", error.message);
    return {
      status: "unknown",
      reason: "Studio couldn't check where this file is used, so it wasn't deleted.",
    };
  }
  return { status: "known", references: (data as MediaReference[]) ?? [] };
}

/**
 * Removes a file from the provider and then from the library -- in that order,
 * and only in that order.
 *
 * Two failures used to be indistinguishable from success. `destroyAsset`
 * returned nothing whether it had deleted anything or not, and a reference
 * lookup that errored came back as an empty list. So an unconfigured
 * environment, or a Cloudinary outage, or a database hiccup during the usage
 * check, all ended with the media row deleted -- and that row was the only
 * record that the remote object existed.
 *
 * Deleting across a provider and a database cannot be one transaction, so the
 * order is chosen for what survives a failure in the middle: the provider
 * first, and the row only once the file is confirmed gone. A failure the other
 * way round leaves an object nothing knows about; this way round leaves a row
 * pointing at a file that is already gone, which is visible, harmless and
 * retryable.
 */
export async function deleteMedia(
  id: string,
  publicId: string,
  kind: "image" | "file",
  options?: { force?: boolean }
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  if (!options?.force) {
    const usage = await getMediaReferences(publicId);

    // Uncertainty is not permission. "Force" is the author saying they know
    // something the check does not; an error is the check saying it does not
    // know anything at all.
    if (usage.status === "unknown") return fail(usage.reason);

    if (usage.references.length) {
      const refs = usage.references;
      return fail(
        `Still used by ${refs.length} item${refs.length > 1 ? "s" : ""}: ` +
          refs
            .slice(0, 3)
            .map((r) => r.label)
            .join(", ") +
          (refs.length > 3 ? "\u2026" : "") +
          ". Remove it there first, or confirm to delete anyway."
      );
    }
  }

  const removal = await destroyAsset(publicId, kind === "file" ? "raw" : "image");
  if (removal.status === "failed") {
    // The library row stays. It is the only thing that knows this file is out
    // there, and without it the file is unreachable and unaccountable.
    return fail(`${removal.reason} The file is still in your library, so you can try again.`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) {
    // The provider copy is gone and the row is not. Say so plainly rather than
    // reporting a clean delete: the row is now the recoverable half, and
    // deleting it again is safe because "not found" counts as deleted.
    return fail(
      `The file was removed from Cloudinary, but its library entry could not be deleted (${error.message}). Try again to clear it.`
    );
  }

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

  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

  const supabase = await createServerSupabase();
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

/* ── internal link targets ─────────────────────────────── */

export interface LinkTargetRow {
  /** The public path a Link block should point at. */
  url: string;
  title: string;
  description: string;
  thumbnail: string | null;
  /** Drafts are selectable, but the Studio has to say so — see the picker. */
  live: boolean;
}

export interface LinkTargetIndex {
  projects: LinkTargetRow[];
  journal: LinkTargetRow[];
}

/**
 * Everything a Link block could point at on this site, for the Studio picker.
 *
 * Deliberately shaped as the block's own fields rather than as database rows:
 * what the picker does on selection is copy these straight into the block, so
 * the public renderer never has to look anything up. That snapshot is the
 * whole point — no N+1 query when a page with six related cards is served, and
 * an exported Studio JSON document that still makes sense on its own.
 *
 * It follows getCommandIndex() above: owner-checked, newest first, capped.
 */
export async function getLinkTargets(): Promise<LinkTargetIndex> {
  const check = await checkOwner();
  if (!check.ok) return { projects: [], journal: [] };

  const supabase = await createServerSupabase();
  const [projects, journal] = await Promise.all([
    supabase
      .from("projects")
      .select("slug, title, subtitle, excerpt, thumbnail_public_id, cover_public_id, status")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .from("journal_posts")
      .select("slug, title, excerpt, cover_public_id, status")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  for (const res of [projects, journal]) {
    if (res.error) console.error("[link-targets] query failed:", res.error.message);
  }

  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

  return {
    projects: (projects.data ?? []).map((row) => ({
      url: `/works/${row.slug}`,
      title: text(row.title),
      // The subtitle is the one-line description of a project; the excerpt is
      // the longer one. Prefer the short one on a card.
      description: text(row.subtitle) || text(row.excerpt),
      thumbnail: row.thumbnail_public_id ?? row.cover_public_id ?? null,
      live: row.status === "published",
    })),
    journal: (journal.data ?? []).map((row) => ({
      url: `/journal/${row.slug}`,
      title: text(row.title),
      description: text(row.excerpt),
      thumbnail: row.cover_public_id ?? null,
      live: row.status === "published",
    })),
  };
}
