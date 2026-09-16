import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { QuickDraft } from "@/components/admin/quick-draft";
import { MessageCard, type InboxMessage } from "@/components/admin/message-card";
import { checkOwner } from "@/lib/owner";
import { cloudinaryServerConfigured } from "@/lib/cloudinary-server";
import { siteUrl, siteUrlIsPlaceholder } from "@/lib/site";
import { findHiddenPublished } from "@/lib/studio-visibility";

/** "2 projects" / "1 journal entry" — the count reads as a sentence. */
function journalOrProject(count: number, singular: string, plural = "") {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

export default async function AdminDashboard() {
  const supabase = await createServerSupabase();
  const owner = await checkOwner();

  const [
    projectsCount,
    projectsDrafts,
    openMessages,
    recentProjects,
    recentJournal,
    recentMessages,
    journalCount,
    journalDrafts,
  ] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase.from("messages").select("id", { count: "exact", head: true }).in("status", ["new", "read"]),
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
      .select("*")
      .in("status", ["new", "read"])
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }).eq("status", "draft"),
  ]);

  // `status` only exists after migration 0003 — fall back to a plain count.
  const messagesFallback = openMessages.error
    ? await supabase.from("messages").select("id", { count: "exact", head: true })
    : null;
  const recentMessagesFallback = recentMessages.error
    ? await supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(3)
    : null;

  // Published but screened out of the public site. Counting it here means the
  // dashboard never reports work as live that no visitor can reach.
  const [allProjects, allJournal] = await Promise.all([
    supabase.from("projects").select("*").eq("status", "published"),
    supabase.from("journal_posts").select("*").eq("status", "published"),
  ]);
  const [hiddenProjects, hiddenJournal] = await Promise.all([
    findHiddenPublished("project", allProjects.data ?? []),
    findHiddenPublished("journal", allJournal.data ?? []),
  ]);
  const hiddenCount = hiddenProjects.size + hiddenJournal.size;

  const inboxCount = openMessages.error ? messagesFallback?.count ?? 0 : openMessages.count ?? 0;
  const inbox = ((recentMessages.error ? recentMessagesFallback?.data : recentMessages.data) ??
    []) as InboxMessage[];

  const stats = [
    {
      label: "Projects",
      value: projectsCount.count ?? 0,
      sub: `${projectsDrafts.count ?? 0} draft`,
      href: "/admin/projects",
      error: projectsCount.error?.message,
    },
    {
      label: "Journal Posts",
      value: journalCount.count ?? 0,
      sub: `${journalDrafts.count ?? 0} draft`,
      href: "/admin/journal",
      error: journalCount.error?.message,
    },
    {
      label: "Inbox",
      value: inboxCount,
      sub: openMessages.error ? "all messages" : "needing attention",
      href: "/admin/messages",
      error: openMessages.error && messagesFallback?.error ? messagesFallback.error.message : undefined,
    },
  ];

  const dbError =
    projectsCount.error?.message ??
    journalCount.error?.message ??
    recentProjects.error?.message ??
    null;

  return (
    <div className="max-w-6xl space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold">Dashboard</h1>
        <p className="mt-1 font-hand text-xl text-soft">the desk behind the desk</p>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5" aria-labelledby="personal-content-heading">
        <h2 id="personal-content-heading" className="font-display text-lg font-semibold">Make this notebook yours</h2>
        <p className="mt-2 max-w-3xl text-sm text-soft">Your personal introduction is ready to edit in Pages. Add your own portraits, moments, and project stories there. Unchanged demo projects, example links, and unfinished template text are kept out of the public site; their originals stay here in Studio.</p>
        {hiddenCount > 0 && (
          <p className="mt-3 max-w-3xl rounded border border-line bg-raise px-3 py-2 text-sm text-soft">
            <span className="font-semibold text-ink">
              {hiddenCount} published {hiddenCount === 1 ? "item is" : "items are"} not on the public site.
            </span>{" "}
            {hiddenProjects.size > 0 && journalOrProject(hiddenProjects.size, "project")}
            {hiddenProjects.size > 0 && hiddenJournal.size > 0 && " and "}
            {hiddenJournal.size > 0 && journalOrProject(hiddenJournal.size, "journal entry", "journal entries")}
            {" still "}
            {hiddenCount === 1 ? "carries" : "carry"} demo copy, a writing prompt, or a placeholder link. Each list below says which.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-pen"><Link href="/admin/pages/home" className="underline-offset-4 hover:underline">Edit the introduction ↗</Link><Link href="/admin/pages/about" className="underline-offset-4 hover:underline">Add photos & moments ↗</Link><Link href="/admin/projects" className="underline-offset-4 hover:underline">Prepare your real projects ↗</Link></div>
      </section>

      {/* Things that are wrong right now, stated plainly. */}
      <Warnings
        dbError={dbError}
        placeholderUrl={siteUrlIsPlaceholder}
        statusColumnMissing={Boolean(openMessages.error)}
      />

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
          href="/admin/pages/about"
          className="flex min-h-[52px] items-center justify-center rounded-md border border-line bg-surface px-3 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
        >
          Edit profile
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
            <p className="text-2xl font-bold text-ink sm:text-4xl">{s.error ? "—" : s.value}</p>
            <p className="mt-1 truncate text-sm font-semibold">{s.label}</p>
            <p className={`hidden text-xs sm:block ${s.error ? "text-red" : "text-soft"}`}>
              {s.error ? "could not read" : s.sub}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-soft">
              Recently edited
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <RecentList
                heading="Projects"
                basePath="/admin/projects"
                rows={recentProjects.data ?? []}
                error={recentProjects.error?.message}
              />
              <RecentList
                heading="Journal"
                basePath="/admin/journal"
                rows={recentJournal.data ?? []}
                error={recentJournal.error?.message}
              />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-soft">
                Inbox — needing attention
              </h2>
              <Link href="/admin/messages" className="font-mono text-xs text-pen hover:underline">
                All messages →
              </Link>
            </div>
            <ul className="space-y-4">
              {inbox.map((m) => (
                <MessageCard key={m.id} message={m} compact />
              ))}
              {inbox.length === 0 && (
                <li className="py-8 text-center text-sm text-soft">
                  Nothing waiting. Archived and followed-up notes live in Messages.
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="order-1 space-y-6 lg:order-2">
          <QuickDraft />

          <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
            <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-wider text-ink">
              System health check
            </h3>
            <dl className="space-y-3 text-sm">
              <HealthRow
                label="Database"
                ok={!dbError}
                okText="Connected"
                failText={dbError ? "Error" : "Offline"}
              />
              <HealthRow
                label="Owner enforcement"
                ok={owner.ok}
                okText="Database-enforced"
                failText="Unknown"
              />
              <HealthRow
                label="Media uploads"
                ok={cloudinaryServerConfigured}
                okText="Configured"
                failText="Unconfigured"
              />
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-medium text-soft">Public URL</dt>
                <dd
                  className={`truncate font-mono text-xs ${siteUrlIsPlaceholder ? "text-red" : "text-soft"}`}
                >
                  {siteUrl.replace(/^https?:\/\//, "")}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({
  label,
  ok,
  okText,
  failText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <dt className="font-medium text-soft">{label}</dt>
      <dd className={`inline-flex items-center gap-1.5 font-semibold ${ok ? "text-pen" : "text-red"}`}>
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-pen" : "bg-red"}`} />
        {ok ? okText : failText}
      </dd>
    </div>
  );
}

function RecentList({
  heading,
  basePath,
  rows,
  error,
}: {
  heading: string;
  basePath: string;
  rows: { id: string; title: string; status: string }[];
  error?: string;
}) {
  return (
    <div>
      <h3 className="mb-2 border-b border-line pb-1 text-sm font-bold text-soft">{heading}</h3>
      {error ? (
        <p role="alert" className="py-3 text-xs text-red">
          Could not read {heading.toLowerCase()}: {error}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="py-2.5">
              <Link
                href={`${basePath}/${r.id}`}
                className="group flex items-center justify-between gap-2 text-sm hover:text-pen"
              >
                <span className="max-w-[150px] truncate font-medium">{r.title}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    r.status === "published" ? "bg-pen-soft text-pen" : "bg-n-200 text-soft"
                  }`}
                >
                  {r.status}
                </span>
              </Link>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-4 text-sm text-soft">Nothing here yet.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function Warnings({
  dbError,
  placeholderUrl,
  statusColumnMissing,
}: {
  dbError: string | null;
  placeholderUrl: boolean;
  statusColumnMissing: boolean;
}) {
  const items: { title: string; body: string }[] = [];

  if (dbError) {
    items.push({
      title: "The database returned an error",
      body: `${dbError} — counts and lists on this page may be incomplete.`,
    });
  }
  if (statusColumnMissing) {
    items.push({
      title: "The inbox has no status column yet",
      body:
        "Messages can be read and deleted but not archived or marked followed up. " +
        "Apply supabase/migrations/0003_owner_and_integrity.sql.",
    });
  }
  if (placeholderUrl) {
    items.push({
      title: "The public URL is still localhost",
      body:
        "Social previews, robots.txt and sitemap.xml will point at localhost. " +
        "Set NEXT_PUBLIC_SITE_URL in the deployment and rebuild.",
    });
  }

  if (items.length === 0) return null;

  return (
    <div role="alert" className="space-y-3 rounded-lg border border-red/40 bg-red-soft/10 p-4">
      {items.map((i) => (
        <div key={i.title}>
          <p className="text-sm font-semibold text-red">{i.title}</p>
          <p className="mt-0.5 text-sm text-soft">{i.body}</p>
        </div>
      ))}
    </div>
  );
}
