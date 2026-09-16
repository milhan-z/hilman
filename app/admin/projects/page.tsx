import { createServerSupabase } from "@/lib/supabase/server";
import { ContentDirectory } from "@/components/admin/content-directory";
import { QueryError } from "@/components/admin/query-error";
import { findHiddenPublished } from "@/lib/studio-visibility";
import { STREAMS, type Stream } from "@/lib/types";

export const metadata = {
  title: "Projects — Studio",
};

export default async function AdminProjectsPage() {
  const supabase = await createServerSupabase();
  // Selecting everything so the public-visibility check sees the same content
  // the public reads do; the list itself is mapped down before it crosses to
  // the client.
  const { data: projects, error } = await supabase.from("projects").select("*").order("sort_order");

  const hidden = await findHiddenPublished("project", projects ?? []);

  return (
    <div className="space-y-5">
      <QueryError what="the project list" error={error?.message} />
      <ContentDirectory
        kind="project"
        title="Projects"
        newHref="/admin/projects/new"
        publicBase="/works"
        searchPlaceholder="Search projects"
        groups={Object.entries(STREAMS).map(([value, stream]) => ({
          value,
          label: stream.name,
        }))}
        items={(projects ?? []).map((project) => ({
          id: project.id,
          title: project.title,
          slug: project.slug,
          status: project.status,
          featured: project.featured,
          group: project.stream,
          meta: [STREAMS[project.stream as Stream]?.name ?? project.stream, project.year]
            .filter(Boolean)
            .join(" · "),
          hiddenReasons: hidden.get(project.id),
        }))}
      />
    </div>
  );
}
