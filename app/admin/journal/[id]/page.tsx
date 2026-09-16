import { notFound } from "next/navigation";
import { LiveEditor } from "@/components/admin/live-editor";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Block } from "@/lib/types";

export default async function JournalEditorPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createServerSupabase();
  const isNew = params.id === "new";

  let initial = null;
  if (!isNew) {
    const { data: post } = await supabase
      .from("journal_posts")
      .select("*, journal_tags(tag:tags(*))")
      .eq("id", params.id)
      .maybeSingle();
    if (!post) notFound();
    const { data: blocks } = await supabase
      .from("content_blocks")
      .select("id, type, position, data")
      .eq("owner_type", "journal")
      .eq("owner_id", params.id)
      .order("position");
    initial = {
      ...post,
      tags: (post.journal_tags ?? []).map((j: any) => j.tag).filter(Boolean),
      blocks: (blocks as Block[]) ?? [],
    };
  }

  const { data: allTags } = await supabase.from("tags").select("*").order("name");

  // No chrome around the editor: it owns the whole screen, including its
  // own back button, status line and "View live" link.
  return <LiveEditor kind="journal" initial={initial} allTags={allTags ?? []} />;
}
