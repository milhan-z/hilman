import { createServerSupabase } from "@/lib/supabase/server";
import { ProjectsDirectory } from "@/components/admin/projects-directory";
import { QueryError } from "@/components/admin/query-error";
import { findHiddenPublished } from "@/lib/studio-visibility";

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
    <div className="max-w-6xl space-y-5">
      <QueryError what="the project list" error={error?.message} />
      <ProjectsDirectory
        initialProjects={(projects ?? []).map((project) => ({
          id: project.id,
          title: project.title,
          slug: project.slug,
          stream: project.stream,
          status: project.status,
          featured: project.featured,
          year: project.year,
          sort_order: project.sort_order,
          hiddenReasons: hidden.get(project.id),
        }))}
      />
    </div>
  );
}
