import { createServerSupabase } from "@/lib/supabase/server";
import { ProjectsDirectory } from "@/components/admin/projects-directory";
import { QueryError } from "@/components/admin/query-error";

export const metadata = {
  title: "Projects — Studio",
};

export default async function AdminProjectsPage() {
  const supabase = await createServerSupabase();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, title, slug, stream, status, featured, year, sort_order")
    .order("sort_order");

  return (
    <div className="max-w-6xl space-y-5">
      <QueryError what="the project list" error={error?.message} />
      <ProjectsDirectory initialProjects={projects ?? []} />
    </div>
  );
}
