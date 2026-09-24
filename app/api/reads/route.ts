import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { supabaseConfigured } from "@/lib/supabase/config";
import { isUuid } from "@/lib/studio-sync-contract";
import { hasStudioSession, isLikelyBot, type ReadKind } from "@/lib/readers";

/**
 * Counts one read of a published project or journal entry.
 *
 * Called by components/reader-count.tsx once a visitor has had the page on
 * screen for a few seconds, at most once a day per browser per entry. A route
 * rather than a Supabase call from the page, for two reasons: the public pages
 * ship no Supabase client — it would be the largest thing on them — and this
 * is where the requests that are not readers are turned away before the
 * database hears about them.
 *
 * The answer is `{ reads }`: the new count, or null when nothing was counted
 * (a crawler, the author, a draft, a database without migration 0013). The
 * page keeps showing what it already had in that case.
 */

const noStore = { "Cache-Control": "no-store" };

function answer(reads: number | null, status = 200) {
  return NextResponse.json({ reads }, { status, headers: noStore });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const kind = body && typeof body === "object" ? (body as Record<string, unknown>).kind : null;
  const id = body && typeof body === "object" ? (body as Record<string, unknown>).id : null;

  if ((kind !== "project" && kind !== "journal") || !isUuid(id)) {
    return NextResponse.json({ error: "Name a project or journal entry by id." }, { status: 400, headers: noStore });
  }

  // Not readers: a crawler or link preview, or the author in their own Studio.
  if (isLikelyBot(request.headers.get("user-agent"))) return answer(null);
  if (hasStudioSession(request.headers.get("cookie"))) return answer(null);

  if (!supabaseConfigured) return answer(null);

  const { data, error } = await createPublicClient().rpc("record_read", {
    p_kind: kind as ReadKind,
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
