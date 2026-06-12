import { createServerSupabase } from "@/lib/supabase/server";
import { ProjectsDirectory } from "@/components/admin/projects-directory";

export const metadata = {
  title: "Projects — Studio",
};

export default async function AdminProjectsPage() {
  const supabase = createServerSupabase();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, slug, stream, status, featured, year, sort_order")
    .order("sort_order");

  return (
    <div className="max-w-6xl">
      <ProjectsDirectory initialProjects={projects ?? []} />
    </div>
  );
}
