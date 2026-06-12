import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveEditor } from "@/components/admin/live-editor";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Block } from "@/lib/types";

export default async function ProjectEditorPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const isNew = params.id === "new";

  let initial = null;
  if (!isNew) {
    const { data: project } = await supabase
      .from("projects")
      .select("*, project_tags(tag:tags(*))")
      .eq("id", params.id)
      .maybeSingle();
    if (!project) notFound();
    const { data: blocks } = await supabase
      .from("content_blocks")
      .select("id, type, position, data")
      .eq("owner_type", "project")
      .eq("owner_id", params.id)
      .order("position");
    initial = {
      ...project,
      tags: (project.project_tags ?? []).map((j: any) => j.tag).filter(Boolean),
      blocks: (blocks as Block[]) ?? [],
    };
  }

  const { data: allTags } = await supabase.from("tags").select("*").order("name");

  return (
    <div className="w-full">
      {initial?.status === "published" && (
        <div className="mb-2 flex justify-end">
          <Link href={`/works/${initial.slug}`} className="text-sm text-pen hover:underline font-mono">
            View live ↗
          </Link>
        </div>
      )}
      <LiveEditor kind="project" initial={initial} allTags={allTags ?? []} />
    </div>
  );
}
