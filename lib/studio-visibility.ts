import { createServerSupabase } from "@/lib/supabase/server";
import {
  getJournalQualityIssues,
  getProjectQualityIssues,
  type ContentQualityInput,
} from "@/lib/content-quality";
import type { Block } from "@/lib/types";

/**
 * Why a published item is still not on the public site.
 *
 * The public reads screen demo stories, unfinished writing prompts and
 * placeholder links. Without this, the studio would show "published" for an
 * entry that no visitor can reach, and the only way to notice would be to open
 * the live site and find it missing.
 */
export type HiddenReasons = Map<string, string[]>;

export async function findHiddenPublished(
  kind: "project" | "journal",
  rows: (ContentQualityInput & { id: string; status?: string })[]
): Promise<HiddenReasons> {
  const published = rows.filter((row) => row.status === "published");
  const hidden: HiddenReasons = new Map();
  if (!published.length) return hidden;

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("content_blocks")
    .select("owner_id, type, position, data")
    .eq("owner_type", kind)
    .in(
      "owner_id",
      published.map((row) => row.id)
    )
    .order("position");

  // Without blocks the verdict would be wrong in the lenient direction, and a
  // false "this is live" is worse than saying nothing.
  if (error) return hidden;

  const byOwner = new Map<string, Block[]>();
  for (const block of data ?? []) {
    const blocks = byOwner.get(block.owner_id) ?? [];
    blocks.push(block as unknown as Block);
    byOwner.set(block.owner_id, blocks);
  }

  for (const row of published) {
    const content = { ...row, blocks: byOwner.get(row.id) ?? [] };
    const issues =
      kind === "project" ? getProjectQualityIssues(content) : getJournalQualityIssues(content);
    if (issues.length) hidden.set(row.id, issues.map((issue) => issue.message));
  }
  return hidden;
}
