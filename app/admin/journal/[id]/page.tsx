import { notFound } from "next/navigation";
import { LiveEditor } from "@/components/admin/live-editor";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Block } from "@/lib/types";

export default async function JournalEditorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const isNew = params.id === "new";

  // Three independent reads. They used to run one after another — the row,
  // then its blocks, then the tag catalogue — so opening an entry cost three
  // round trips stacked end to end before anything could be drawn. None of
  // them depends on the others' answers.
  const [record, blockRows, allTags] = await Promise.all([
    isNew
      ? Promise.resolve(null)
      : supabase
          .from("journal_posts")
          .select("*, journal_tags(tag:tags(*))")
          .eq("id", params.id)
          .maybeSingle()
          .then((result) => result.data),
    isNew
      ? Promise.resolve([])
      : supabase
          .from("content_blocks")
          .select("id, type, position, data")
          .eq("owner_type", "journal")
          .eq("owner_id", params.id)
          .order("position")
          .then((result) => result.data ?? []),
    supabase
      .from("tags")
      .select("*")
      .order("name")
      .then((result) => result.data),
  ]);

  if (!isNew && !record) notFound();

  const initial = record
    ? {
        ...record,
        tags: (record.journal_tags ?? []).map((j: any) => j.tag).filter(Boolean),
        blocks: (blockRows as Block[]) ?? [],
      }
    : null;

  // No chrome around the editor: it owns the whole screen, including its
  // own back button, status line and "View live" link.
  return <LiveEditor kind="journal" initial={initial} allTags={allTags ?? []} />;
}
