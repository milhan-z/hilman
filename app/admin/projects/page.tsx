import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { STREAMS, type Stream } from "@/lib/types";

export default async function AdminProjectsPage() {
  const supabase = createServerSupabase();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, title, slug, stream, status, featured, year, sort_order")
    .order("sort_order");

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Projects</h1>
        <Link href="/admin/projects/new" className="rounded bg-pen px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          + New project
        </Link>
      </div>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
        {(projects ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/admin/projects/${p.id}`} className="flex items-center gap-3 px-4 py-3.5 text-sm hover:bg-n-100">
              <span className="min-w-0 flex-1 truncate font-medium">
                {p.featured && <span className="mr-1.5" title="Featured">📌</span>}
                {p.title}
              </span>
              <span className="hidden text-xs text-faint sm:inline">{STREAMS[p.stream as Stream]?.name}</span>
              {p.year && <span className="hidden text-xs text-faint sm:inline">{p.year}</span>}
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs uppercase tracking-wider ${p.status === "published" ? "bg-pen-soft text-pen" : "bg-hl-soft text-hl-ink"}`}>
                {p.status}
              </span>
            </Link>
          </li>
        ))}
        {(projects ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-faint">No projects yet.</li>
        )}
      </ul>
    </div>
  );
}
