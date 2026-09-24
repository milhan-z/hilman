import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { checkOwner } from "@/lib/owner";
import { createServerSupabase } from "@/lib/supabase/server";
import { normaliseFields } from "@/lib/studio-content";
import { sanitizeStudioHtml } from "@/lib/studio-html";
import { getJournalQualityIssues, getProjectQualityIssues } from "@/lib/content-quality";
import { readTimeMinutes } from "@/lib/read-time";
import { resolveTagIds, tagFailureIsPermanent, type TagStore } from "@/lib/tags";
import {
  describeMalformedMutation,
  type ServerDocument,
  type SyncEntity,
  type SyncMutation,
  type SyncOutcome,
  type SyncResponse,
} from "@/lib/studio-sync-contract";
import type { Block } from "@/lib/types";

/**
 * Where a queued save lands.
 *
 * This is not a second way into the database — it is the same ownership check
 * and the same transactional RPC the editor's form post uses, reached over
 * JSON so a phone can replay it later. Everything that decides whether a write
 * is allowed still happens here and in RLS, never in the browser:
 *
 *   Supabase session  →  checkOwner()  →  save_content_synced()  →  RLS
 *
 * A queue adds exactly two questions the form post never had to ask. "Have I
 * already applied this?" — answered by the mutation id ledger in migration
 * 0006. And "was this written against the version that is still there?" —
 * answered by baseUpdatedAt, which comes back as a 409-shaped conflict rather
 * than overwriting someone's afternoon.
 */

/** One phone, one queue. Enough headroom for a weekend of drafts, not a flood. */
const MAX_MUTATIONS_PER_REQUEST = 25;

/**
 * Reachability probe. Answers nothing but "this origin is responding", which
 * is why it does no ownership check and touches no database — the offline
 * screen polls it, and a poll that costs a Supabase round trip is a poll that
 * gets switched off.
 *
 * `navigator.onLine` cannot replace it: it reports the network interface, not
 * whether anything is on the other end of it.
 */
export function GET() {
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const owner = await checkOwner();
  if (!owner.ok) {
    const status =
      owner.reason === "unconfigured" ? 503 : owner.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: owner.message }, { status });
  }

  const body = await request.json().catch(() => null);
  const mutations: unknown = body && typeof body === "object" ? (body as any).mutations : null;

  if (!Array.isArray(mutations) || mutations.length === 0) {
    return NextResponse.json({ error: "Nothing to sync." }, { status: 400 });
  }
  if (mutations.length > MAX_MUTATIONS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Send at most ${MAX_MUTATIONS_PER_REQUEST} queued saves at a time.` },
      { status: 413 }
    );
  }

  const supabase = await createServerSupabase();
  const results: SyncOutcome[] = [];
  let anythingSaved = false;

  // Sequentially: two queued saves can be for the same row, and the second one
  // needs to see the timestamp the first one produced.
  for (const candidate of mutations) {
    const outcome = await applyMutation(supabase, candidate);
    results.push(outcome);
    if (outcome.status === "saved") anythingSaved = true;
  }

  if (anythingSaved) revalidateSite();

  const response: SyncResponse = { results };
  return NextResponse.json(response);
}

async function applyMutation(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  candidate: unknown
): Promise<SyncOutcome> {
  const malformed = describeMalformedMutation(candidate);
  const mutation = candidate as SyncMutation;

  // Identifiers first: without them there is nowhere to report the failure to.
  const mutationId = typeof mutation?.mutationId === "string" ? mutation.mutationId : "";
  const localId = typeof mutation?.localId === "string" ? mutation.localId : "";

  if (malformed)
    return { status: "rejected", mutationId, localId, reason: "MALFORMED", message: malformed };

  const entity: SyncEntity = mutation.entity;
  const fields = normaliseFields(entity, mutation.payload.fields);
  // Sanitised here, on the server, before anything is written down.
  //
  // The editor sanitises its preview too, but that is a courtesy to whoever is
  // typing — it runs in a browser, and a browser is the one part of this that
  // an attacker controls. This is the boundary where it counts: whatever ends
  // up in the database has already been through the allowlist, so every reader
  // of that row — the public page, an export, a future feature — gets markup
  // that cannot execute.
  const blocks = sanitiseHtmlBlocks(mutation.payload.blocks);

  const blockError = describeMalformedBlocks(blocks);
  if (blockError)
    return { status: "rejected", mutationId, localId, message: `${blockError} Nothing was saved.` };

  // Reading time is derived, and derived here as well as in the editor: the
  // column is read by list pages that are served without blocks, and a payload
  // is something a client composed. Counting the words we are about to store is
  // the only version that cannot be stale or wrong.
  if (entity === "journal") {
    fields.reading_minutes = String(
      readTimeMinutes({ excerpt: String(fields.excerpt ?? ""), blocks })
    );
  }

  // Publishing has to clear the same quality gate as the editor does, or the
  // queue would become a way to publish a placeholder that the form refuses.
  if (fields.status === "published") {
    const issues =
      entity === "project"
        ? getProjectQualityIssues({ ...fields, blocks })
        : getJournalQualityIssues({ ...fields, blocks });
    if (issues.length) {
      const prompts = issues.find((issue) => issue.code === "template")?.prompts?.length ?? 0;
      return {
        status: "rejected",
        mutationId,
        localId,
        reason: "CONTENT_BLOCKED",
        prompts,
        message: `${issues.map((issue) => issue.message).join(" ")} It is still saved here as a draft.`,
      };
    }
  }

  // Tags typed as new names become real tags here, last, once everything that
  // could refuse this save has had its say — so a rejected publish does not
  // leave tags behind. A retry of the same save finds the tags the first
  // attempt made and gets the same ids, which keeps the save function's
  // idempotency digest (0006, 0009) identical. See lib/tags.ts.
  let tagIds = mutation.payload.tagIds;
  if (mutation.payload.tagNames?.length) {
    try {
      tagIds = await resolveTagIds(tagStore(supabase), tagIds, mutation.payload.tagNames);
    } catch (cause: any) {
      return {
        status: tagFailureIsPermanent(cause) ? "rejected" : "retry",
        mutationId,
        localId,
        message: cause?.message || "The new tags couldn't be created.",
      };
    }
  }

  const { data, error } = await supabase.rpc("save_content_synced", {
    p_mutation_id: mutationId,
    p_entity: entity,
    p_id: mutation.entityId,
    p_base_updated_at: mutation.baseUpdatedAt,
    p_data: fields,
    p_blocks: blocks,
    p_tag_ids: tagIds,
  });

  if (error) {
    if (error.code === "PGRST202" || /save_content_synced/.test(error.message)) {
      return {
        status: "rejected",
        mutationId,
        localId,
        message:
          "The sync function is missing from the database. Apply supabase/migrations/0006_studio_sync.sql.",
      };
    }
    // 42501 is "not the owner" and 23514/22023 are rejected payloads: all of
    // them will refuse the same way next time, so they go back to the editor.
    const permanent = ["42501", "23514", "22023", "P0002", "23505"].includes(error.code ?? "");
    return {
      status: permanent ? "rejected" : "retry",
      mutationId,
      localId,
      message: error.message,
    };
  }

  const result = data as
    | { status: "saved"; id: string; updated_at: string; replayed: boolean }
    | { status: "conflict"; id: string; server_updated_at: string };

  if (result?.status === "conflict") {
    const server = await readServerDocument(supabase, entity, result.id);
    return {
      status: "conflict",
      mutationId,
      localId,
      id: result.id,
      serverUpdatedAt: result.server_updated_at,
      server: server ?? {
        id: result.id,
        updatedAt: result.server_updated_at,
        fields: {},
        blocks: [],
        tagIds: [],
      },
    };
  }

  if (result?.status !== "saved") {
    return { status: "retry", mutationId, localId, message: "The database gave no answer." };
  }

  return {
    status: "saved",
    mutationId,
    localId,
    id: result.id,
    updatedAt: result.updated_at,
    replayed: Boolean(result.replayed),
  };
}

/**
 * The tags table, as tag resolution needs it. Reads and writes go through the
 * owner's own session, so RLS decides here exactly as it does in Taxonomy.
 */
function tagStore(supabase: Awaited<ReturnType<typeof createServerSupabase>>): TagStore {
  return {
    async list() {
      const { data, error } = await supabase.from("tags").select("id, slug, name");
      if (error) throw error;
      return (data ?? []).map((tag) => ({
        id: String(tag.id),
        slug: String(tag.slug),
        name: String(tag.name),
      }));
    },
    async insert(rows) {
      // `on conflict (slug) do nothing`: a tag another save made a moment ago
      // is not an error, it is the tag this save was about to make.
      const { error } = await supabase
        .from("tags")
        .upsert(rows, { onConflict: "slug", ignoreDuplicates: true });
      if (error) throw error;
    },
  };
}

/** The version that is actually on the server, shaped like the editor's state. */
async function readServerDocument(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  entity: SyncEntity,
  id: string
): Promise<ServerDocument | null> {
  const table = entity === "project" ? "projects" : "journal_posts";
  const joinTable = entity === "project" ? "project_tags" : "journal_tags";
  const joinColumn = entity === "project" ? "project_id" : "journal_id";

  const [row, blocks, tags] = await Promise.all([
    supabase.from(table).select("*").eq("id", id).maybeSingle(),
    supabase
      .from("content_blocks")
      .select("id, type, position, data")
      .eq("owner_type", entity)
      .eq("owner_id", id)
      .order("position"),
    supabase.from(joinTable).select("tag_id").eq(joinColumn, id),
  ]);

  if (row.error || !row.data) return null;

  const { id: rowId, updated_at: updatedAt, ...fields } = row.data as Record<string, any>;
  return {
    id: String(rowId),
    updatedAt: String(updatedAt),
    fields,
    blocks: (blocks.data as Block[]) ?? [],
    tagIds: (tags.data ?? []).map((t: any) => String(t.tag_id)),
  };
}

/**
 * Runs every `html` block's markup through the studio's allowlist.
 *
 * Returns a new list; the caller's payload is not modified in place, because
 * the same object is also what the conflict machinery reports back.
 */
function sanitiseHtmlBlocks(blocks: Block[]): Block[] {
  if (!Array.isArray(blocks)) return blocks;
  return blocks.map((block) => {
    if (block?.type !== "html") return block;
    const raw = String((block.data as Record<string, unknown> | undefined)?.html ?? "");
    return { ...block, data: { ...(block.data ?? {}), html: sanitizeStudioHtml(raw) } };
  });
}

function describeMalformedBlocks(blocks: unknown): string | null {
  if (!Array.isArray(blocks)) return "The content payload isn't a list of blocks.";
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (!block || typeof block !== "object") return `Block ${i + 1} is malformed.`;
    const type = (block as any).type;
    if (typeof type !== "string" || !type.trim()) return `Block ${i + 1} has no type.`;
    const data = (block as any).data;
    if (data != null && (typeof data !== "object" || Array.isArray(data)))
      return `Block ${i + 1} has a malformed payload.`;
  }
  return null;
}

/** Same set of paths the editor's own save refreshes. */
function revalidateSite() {
  for (const path of ["/", "/works", "/journal", "/about", "/connect", "/lab"]) {
    revalidatePath(path);
  }
  revalidatePath("/works/[slug]", "page");
  revalidatePath("/journal/[slug]", "page");
  revalidatePath("/sitemap.xml");
  revalidatePath("/admin/projects");
  revalidatePath("/admin/journal");
  // A save can make tags now, so the catalogue can change with it.
  revalidatePath("/admin/taxonomy");
}
