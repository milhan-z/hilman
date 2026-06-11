import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminDashboard() {
  const supabase = createServerSupabase();
  const [projects, drafts, journal, journalDrafts, messages, recent] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase
      .from("projects")
      .select("id, title, updated_at, status")
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const stats = [
    { label: "Projects", value: projects.count ?? 0, sub: `${drafts.count ?? 0} draft`, href: "/admin/projects" },
    { label: "Journal entries", value: journal.count ?? 0, sub: `${journalDrafts.count ?? 0} draft`, href: "/admin/journal" },
    { label: "Messages", value: messages.count ?? 0, sub: "from Connect", href: "/admin/messages" },
  ];

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 font-hand text-xl text-faint">the desk behind the desk</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="rounded-lg border border-line bg-surface p-5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift"
          >
            <p className="text-3xl font-bold text-ink">{s.value}</p>
            <p className="mt-1 text-sm font-medium">{s.label}</p>
            <p className="text-xs text-faint">{s.sub}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/projects/new" className="rounded bg-pen px-4 py-2.5 text-sm font-medium text-white hover:opacity-90">
          + New project
        </Link>
        <Link href="/admin/journal/new" className="rounded border border-line px-4 py-2.5 text-sm hover:border-pen hover:text-pen">
          + New journal entry
        </Link>
        <Link href="/admin/media" className="rounded border border-line px-4 py-2.5 text-sm hover:border-pen hover:text-pen">
          Upload media
        </Link>
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-faint">Recently edited</h2>
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-surface">
          {(recent.data ?? []).map((p) => (
            <li key={p.id}>
              <Link href={`/admin/projects/${p.id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-n-100">
                <span className="truncate">{p.title}</span>
                <span className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-2xs uppercase tracking-wider ${p.status === "published" ? "bg-pen-soft text-pen" : "bg-hl-soft text-hl-ink"}`}>
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
          {(recent.data ?? []).length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-faint">Nothing here yet — run the seed or create your first project.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
