import type { createServerSupabase } from "@/lib/supabase/server";
import type { ReadKind } from "@/lib/readers";

type StudioClient = Awaited<ReturnType<typeof createServerSupabase>>;

/**
 * Reader counts for the Studio's lists, keyed by entry id.
 *
 * Quiet on failure, like the public read in lib/data.ts: before migration 0013
 * there is no table, and the list of your own work must not fail over a
 * number beside each title.
 */
export async function readCountsFor(supabase: StudioClient, kind: ReadKind): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from("content_reads")
    .select("owner_id, reads")
    .eq("owner_type", kind);
  if (error) return counts;
  for (const row of data ?? []) counts.set(String(row.owner_id), Number(row.reads) || 0);
  return counts;
}
