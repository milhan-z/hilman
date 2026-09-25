import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isUuid } from "@/lib/studio-sync-contract";
import { hasStudioSession, isLikelyBot, type ReadKind } from "@/lib/readers";

/**
 * Reads, and counts one read of, a published project or journal entry.
 *
 * GET is the live number, asked for by components/reader-count.tsx as an
 * entry page opens. POST counts a read, and is sent once a visitor has had
 * the page on screen for a few seconds, at most once a day per browser per
 * entry. A route rather than Supabase calls from the page, for two reasons:
 * the public pages ship no Supabase client — it would be the largest thing on
 * them — and this is where the requests that are not readers are turned away
 * before the database hears about them.
 *
 * Both answer `{ reads }`. For POST that is the new count, or null when
 * nothing was counted (a crawler, the author, a draft, a database without
 * migration 0013) — the page keeps showing the number GET gave it.
 */

const noStore = { "Cache-Control": "no-store" };

function answer(reads: number | null, status = 200) {
  return NextResponse.json({ reads }, { status, headers: noStore });
}

/** The entry a request names, or null when it names nothing countable. */
function target(kind: unknown, id: unknown): { kind: ReadKind; id: string } | null {
  return (kind === "project" || kind === "journal") && isUuid(id) ? { kind, id } : null;
}

const unnamed = () =>
  NextResponse.json({ error: "Name a project or journal entry by id." }, { status: 400, headers: noStore });

/**
 * The current count, without counting anything.
 *
 * The entry pages are static and regenerated at most once a minute, and only
 * when somebody asks — so on a quiet notebook the number baked into a page is
 * often from before its last few reads, and from before its first one it is
 * no number at all. The page asks for the live number as it opens, so it
 * shows what the database has to whoever is looking: a visitor already
 * counted today, a crawler, or the author signed in to the Studio.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const entry = target(params.get("kind"), params.get("id"));
  if (!entry) return unnamed();
  if (!supabaseConfigured) return answer(null);

  const { data, error } = await createPublicClient()
    .from("content_reads")
    .select("reads")
    .eq("owner_type", entry.kind)
    .eq("owner_id", entry.id)
    .maybeSingle();

  // Quiet on failure, like every other read of the counts.
  if (error) return answer(null);
  return answer(data ? Number(data.reads) || 0 : 0);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const entry = target(fields.kind, fields.id);
  if (!entry) return unnamed();
  const { kind, id } = entry;

  // Not readers: a crawler or link preview, or the author in their own Studio.
  if (isLikelyBot(request.headers.get("user-agent"))) return answer(null);
  if (hasStudioSession(request.headers.get("cookie"))) return answer(null);

  if (!supabaseConfigured) return answer(null);

  const { data, error } = await createPublicClient().rpc("record_read", {
    p_kind: kind,
    p_id: id,
  });

  if (error) {
    // Before migration 0013 the function does not exist. A counter is never
    // worth an error on somebody's screen, so the visitor hears nothing and
    // the log says what to apply.
    console.error(
      "[reads] could not record a read:",
      error.code === "PGRST202" ? "apply supabase/migrations/0013_reader_counts.sql" : error.message
    );
    return answer(null);
  }

  return answer(typeof data === "number" ? data : data == null ? null : Number(data));
}
