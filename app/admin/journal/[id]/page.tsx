import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentEditor } from "@/components/admin/content-editor";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Block } from "@/lib/types";

export default async function JournalEditorPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
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

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">{isNew ? "New entry" : `Edit: ${initial?.title}`}</h1>
        {initial?.status === "published" && (
          <Link href={`/journal/${initial.slug}`} className="text-sm text-pen hover:underline">
            View live ↗
          </Link>
        )}
      </div>
      <ContentEditor kind="journal" initial={initial} allTags={allTags ?? []} />
    </div>
  );
}
