import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { QuickDraft } from "@/components/admin/quick-draft";
import { deleteMessage } from "./actions";
import { formatDate } from "@/lib/utils";
import { cloudinaryServerConfigured } from "@/lib/cloudinary-server";

export default async function AdminDashboard() {
  const supabase = createServerSupabase();

  // Parallel fetches for statistics and recent data
  const [
    projectsCount,
    projectsDrafts,
    journalCount,
    journalDrafts,
    messagesCount,
    recentProjects,
    recentJournal,
    recentMessages,
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("messages").select("id", { count: "exact", head: true }),
    supabase
      .from("projects")
      .select("id, title, updated_at, status")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("journal_posts")
      .select("id, title, updated_at, status")
      .order("updated_at", { ascending: false })
      .limit(3),
    supabase
      .from("messages")
      .select("id, name, email, body, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const stats = [
    {
      label: "Projects",
      value: projectsCount.count ?? 0,
      sub: `${projectsDrafts.count ?? 0} draft`,
      href: "/admin/projects",
      bgClass: "bg-pen-soft/20 text-pen",
    },
    {
      label: "Journal Posts",
      value: journalCount.count ?? 0,
      sub: `${journalDrafts.count ?? 0} draft`,
      href: "/admin/journal",
      bgClass: "bg-hl-soft text-ink",
    },
    {
      label: "Messages Inbox",
      value: messagesCount.count ?? 0,
      sub: "from Connect form",
      href: "/admin/messages",
      bgClass: "bg-red-soft/20 text-red",
    },
  ];

  const supabaseLive = !projectsCount.error;

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 font-hand text-xl text-faint">the desk behind the desk</p>
      </div>

      {/* Quick actions — one tap to the things you actually do */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Link
          href="/admin/projects/new"
          className="flex min-h-[52px] items-center justify-center rounded-md bg-hl px-3 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90"
        >
          + New project
        </Link>
        <Link
          href="/admin/journal/new"
          className="flex min-h-[52px] items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-pen hover:text-pen"
        >
          + New journal
        </Link>
        <Link
          href="/admin/media"
          className="flex min-h-[52px] items-center justify-center rounded-md border border-line bg-surface px-3 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
        >
          Media library
        </Link>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-[52px] items-center justify-center rounded-md border border-line bg-surface px-3 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
        >
          View site ↗
        </a>
      </div>

      {/* Stats — compact, 3-up even on mobile */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group relative overflow-hidden rounded-lg border border-line bg-surface p-3.5 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift sm:p-5"
          >
            <p className="text-2xl font-bold text-ink sm:text-4xl">{s.value}</p>
            <p className="mt-1 truncate text-xs font-semibold sm:text-sm">{s.label}</p>
            <p className="hidden text-xs text-faint sm:block">{s.sub}</p>
          </Link>
        ))}
      </div>

      {/* Dashboard Main Grid */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* Left Side: Recent Lists (2/3 width) */}
        <div className="lg:col-span-2 space-y-6 lg:order-1 order-2">
          
          {/* Recent Activity */}
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-faint mb-3">
              Recently Edited Content
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Projects */}
              <div>
                <h3 className="text-sm font-bold text-soft mb-2 border-b border-line pb-1">Projects</h3>
                <ul className="divide-y divide-line">
                  {(recentProjects.data ?? []).map((p) => (
                    <li key={p.id} className="py-2.5">
                      <Link href={`/admin/projects/${p.id}`} className="group flex items-center justify-between text-xs hover:text-pen">
                        <span className="truncate max-w-[150px] font-medium">{p.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                          p.status === "published" ? "bg-pen-soft text-pen" : "bg-n-200 text-soft"
                        }`}>
                          {p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {(recentProjects.data ?? []).length === 0 && (
                    <li className="py-4 text-xs text-faint italic">No projects found.</li>
                  )}
                </ul>
              </div>

              {/* Journal */}
              <div>
                <h3 className="text-sm font-bold text-soft mb-2 border-b border-line pb-1">Journal</h3>
                <ul className="divide-y divide-line">
                  {(recentJournal.data ?? []).map((j) => (
                    <li key={j.id} className="py-2.5">
                      <Link href={`/admin/journal/${j.id}`} className="group flex items-center justify-between text-xs hover:text-pen">
                        <span className="truncate max-w-[150px] font-medium">{j.title}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
                          j.status === "published" ? "bg-pen-soft text-pen" : "bg-n-200 text-soft"
                        }`}>
                          {j.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {(recentJournal.data ?? []).length === 0 && (
                    <li className="py-4 text-xs text-faint italic">No journal posts found.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Recent Message Inbox */}
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-2 mb-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-faint">
                Recent Inbox Submissions
              </h2>
              <Link href="/admin/messages" className="text-xs text-pen hover:underline font-mono">
                View all messages →
              </Link>
            </div>
            <ul className="space-y-4">
              {(recentMessages.data ?? []).map((m) => (
                <li key={m.id} className="rounded border border-line bg-raise p-3 text-xs space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-semibold text-ink">
                      {m.name} · <a href={`mailto:${m.email}`} className="text-pen hover:underline font-normal">{m.email}</a>
                    </p>
                    <span className="text-[10px] text-faint">{formatDate(m.created_at)}</span>
                  </div>
                  <p className="line-clamp-2 leading-relaxed text-soft">{m.body}</p>
                  <div className="flex justify-end pt-1">
                    <form
                      action={async () => {
                        "use server";
                        await deleteMessage(m.id);
                      }}
                    >
                      <button className="text-[10px] text-red font-medium hover:underline">
                        Dismiss Message
                      </button>
                    </form>
                  </div>
                </li>
              ))}
              {(recentMessages.data ?? []).length === 0 && (
                <li className="py-8 text-center text-xs text-faint italic">
                  Inbox is currently empty.
                </li>
              )}
            </ul>
          </div>

        </div>

        {/* Right Side: Quick widgets — first on mobile, where Quick Draft matters most */}
        <div className="space-y-6 lg:order-2 order-1">
          
          {/* Quick Draft Widget */}
          <QuickDraft />

          {/* System Status / Diagnostics Card */}
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink mb-3 uppercase tracking-wider">
              System Health Check
            </h3>
            <div className="space-y-3">
              {/* Database connection */}
              <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                <span className="text-soft font-medium">Database (Supabase)</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  supabaseLive ? "text-green-500" : "text-red"
                }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${supabaseLive ? "bg-green-500" : "bg-red"}`} />
                  {supabaseLive ? "Connected" : "Offline / Error"}
                </span>
              </div>
              
              {/* Media storage */}
              <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                <span className="text-soft font-medium">Media Uploads (Cloudinary)</span>
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  cloudinaryServerConfigured ? "text-green-500" : "text-yellow-500"
                }`}>
                  <span className={`h-2.5 w-2.5 rounded-full ${cloudinaryServerConfigured ? "bg-green-500" : "bg-yellow-500"}`} />
                  {cloudinaryServerConfigured ? "Configured" : "Unconfigured"}
                </span>
              </div>

              {/* Environment info */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-soft font-medium">Node Environment</span>
                <span className="font-mono text-faint uppercase font-bold">
                  {process.env.NODE_ENV || "development"}
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
