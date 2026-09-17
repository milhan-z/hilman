import { Suspense } from "react";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { MessageCard, type InboxMessage } from "@/components/admin/message-card";
import { checkOwner } from "@/lib/owner";
import { cloudinaryServerConfigured } from "@/lib/cloudinary-server";
import { siteUrl, siteUrlIsPlaceholder } from "@/lib/site";
import { findHiddenPublished } from "@/lib/studio-visibility";
import { InstallHelp } from "@/components/admin/install-help";
import { ResumeWork } from "@/components/admin/resume-work";
import { HomeHeader } from "@/components/admin/mobile/home-header";
import { QuickAddGrid } from "@/components/admin/mobile/quick-add-grid";
import { PublishBadge } from "@/components/admin/mobile/status-line";

/**
 * Home.
 *
 * This was a dashboard: ten Supabase queries and two whole-table reads, all of
 * them awaited before a single pixel could be sent, in front of a grid of
 * counts. On a phone that is the wrong content *and* the wrong order — you
 * open the studio to carry on with something, not to find out how many
 * projects you have.
 *
 * So the shape is inverted. What you were doing and what you might start are
 * client-side and instant: one reads IndexedDB, the other is four links. The
 * database work happens underneath them in Suspense boundaries, streaming in
 * as it finishes rather than holding the route hostage. The counts and the
 * health check are last, because they are the part you look at once a week.
 */

export default async function AdminHome() {
  return (
    <div className="max-w-6xl space-y-7 pb-4">
      {/* The studio has exactly one user and the masthead already says who.
          Asking the database for a name to greet him with would put a query in
          front of the first line on the screen. */}
      <HomeHeader name="Hilman" />

      {/* Both of these read the browser, not the database, so they are on
          screen before the first query has answered. */}
      <ResumeWork />
      <QuickAddGrid />

      <Suspense fallback={<SectionSkeleton label="Recent" rows={4} />}>
        <Recent />
      </Suspense>

      <InstallHelp />

      {/* Everything below here is reference material. It streams in last on
          purpose: none of it is a reason to have opened the app. */}
      <Suspense fallback={null}>
        <SiteState />
      </Suspense>
    </div>
  );
}

/* ── recent work ───────────────────────────────────────── */

interface RecentRow {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  kind: "project" | "journal";
}

async function Recent() {
  const supabase = await createServerSupabase();
  const [projects, journal] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(4),
    supabase
      .from("journal_posts")
      .select("id, title, status, updated_at")
      .order("updated_at", { ascending: false })
      .limit(4),
  ]);

  const error = projects.error?.message ?? journal.error?.message ?? null;
  const rows: RecentRow[] = [
    ...(projects.data ?? []).map((row) => ({ ...row, kind: "project" as const })),
    ...(journal.data ?? []).map((row) => ({ ...row, kind: "journal" as const })),
  ]
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, 6);

  if (error) {
    return (
      <section className="space-y-2.5">
        <SectionHeading>Recent</SectionHeading>
        <p role="alert" className="rounded-lg border border-red/40 bg-red-soft/10 p-4 text-sm text-red">
          The studio could not read your work just now. {error}
        </p>
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className="space-y-2.5">
        <SectionHeading>Recent</SectionHeading>
        <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-faint">
          Nothing here yet. Start with a note.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-2.5">
      <SectionHeading>Recent</SectionHeading>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {rows.map((row) => (
          <li key={`${row.kind}-${row.id}`}>
            <Link
              href={`/admin/${row.kind === "project" ? "projects" : "journal"}/${row.id}`}
              prefetch={false}
              className="flex min-h-[56px] items-center gap-3 px-3.5 py-2.5 transition-colors active:bg-card-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{row.title}</span>
                <span className="mt-0.5 block text-xs text-faint">
                  {row.kind === "project" ? "Project" : "Journal"} · {relative(row.updated_at)}
                </span>
              </span>
              <PublishBadge label={row.status === "published" ? "Live" : "Draft"} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── the parts you check, not the parts you use ────────── */

async function SiteState() {
  const supabase = await createServerSupabase();
  const owner = await checkOwner();

  const [projects, journal, messages] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }),
    supabase.from("journal_posts").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("*").in("status", ["new", "read"]).order("created_at", { ascending: false }).limit(3),
  ]);

  // `status` only exists after migration 0003 — fall back to a plain read.
  const inboxFallback = messages.error
    ? await supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(3)
    : null;
  const inbox = ((messages.error ? inboxFallback?.data : messages.data) ?? []) as InboxMessage[];

  const dbError = projects.error?.message ?? journal.error?.message ?? null;

  return (
    <div className="space-y-7">
      <Suspense fallback={null}>
        <HiddenFromSite />
      </Suspense>

      {inbox.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <SectionHeading>Inbox</SectionHeading>
            <Link href="/admin/messages" prefetch={false} className="font-mono text-2xs text-pen">
              All messages →
            </Link>
          </div>
          <ul className="space-y-3 rounded-lg border border-line bg-surface p-4">
            {inbox.map((message) => (
              <MessageCard key={message.id} message={message} compact />
            ))}
          </ul>
        </section>
      )}

      <Warnings
        dbError={dbError}
        placeholderUrl={siteUrlIsPlaceholder}
        statusColumnMissing={Boolean(messages.error)}
      />

      <details className="rounded-lg border border-line bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center justify-between px-4 text-sm font-medium text-soft">
          The site at a glance
          <span aria-hidden className="text-faint">⌄</span>
        </summary>
        <div className="border-t border-line p-4">
          <dl className="grid grid-cols-3 gap-3 text-center">
            <Count label="Projects" value={projects.error ? null : projects.count ?? 0} href="/admin/projects" />
            <Count label="Journal" value={journal.error ? null : journal.count ?? 0} href="/admin/journal" />
            <Count label="Messages" value={inbox.length} href="/admin/messages" />
          </dl>
          <dl className="mt-5 space-y-3 text-sm">
            <HealthRow label="Database" ok={!dbError} okText="Connected" failText="Error" />
            <HealthRow label="Owner enforcement" ok={owner.ok} okText="Database-enforced" failText="Unknown" />
            <HealthRow label="Media uploads" ok={cloudinaryServerConfigured} okText="Configured" failText="Unconfigured" />
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-medium text-soft">Public address</dt>
              <dd className={`truncate font-mono text-xs ${siteUrlIsPlaceholder ? "text-red" : "text-soft"}`}>
                {siteUrl.replace(/^https?:\/\//, "")}
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}

/**
 * Published, and still not on the public site.
 *
 * This reads every published row and runs the quality checks over it, which is
 * by some distance the most expensive thing on this screen. It is worth saying
 * and it is not worth waiting for, so it has a boundary of its own.
 */
async function HiddenFromSite() {
  const supabase = await createServerSupabase();
  const [projects, journal] = await Promise.all([
    supabase.from("projects").select("*").eq("status", "published"),
    supabase.from("journal_posts").select("*").eq("status", "published"),
  ]);
  const [hiddenProjects, hiddenJournal] = await Promise.all([
    findHiddenPublished("project", projects.data ?? []),
    findHiddenPublished("journal", journal.data ?? []),
  ]);

  const count = hiddenProjects.size + hiddenJournal.size;
  if (count === 0) return null;

  return (
    <section
      role="status"
      className="rounded-lg border border-hl/50 bg-hl-soft/15 p-4"
      aria-label="Published items that are not on the site"
    >
      <p className="text-sm font-semibold text-ink">
        {count} published {count === 1 ? "item is" : "items are"} not on the public site.
      </p>
      <p className="mt-1 text-sm text-soft">
        They still carry demo copy, a writing prompt, or a placeholder link. The lists say which.
      </p>
      <div className="mt-3 flex gap-4 text-sm text-pen">
        {hiddenProjects.size > 0 && (
          <Link href="/admin/projects" prefetch={false} className="underline-offset-4 hover:underline">
            Projects →
          </Link>
        )}
        {hiddenJournal.size > 0 && (
          <Link href="/admin/journal" prefetch={false} className="underline-offset-4 hover:underline">
            Journal →
          </Link>
        )}
      </div>
    </section>
  );
}

/* ── small pieces ──────────────────────────────────────── */

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">{children}</h2>
  );
}

function SectionSkeleton({ label, rows }: { label: string; rows: number }) {
  return (
    <section className="space-y-2.5">
      <SectionHeading>{label}</SectionHeading>
      <ul className="space-y-2" aria-hidden>
        {Array.from({ length: rows }, (_, index) => (
          <li
            key={index}
            className="h-[56px] animate-pulse rounded-lg border border-line bg-surface motion-reduce:animate-none"
            style={{ opacity: 1 - index * 0.18 }}
          />
        ))}
      </ul>
    </section>
  );
}

function Count({ label, value, href }: { label: string; value: number | null; href: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd>
        <Link href={href} prefetch={false} className="block rounded-md py-1">
          <span className="block text-2xl font-bold text-ink">{value ?? "—"}</span>
          <span className="mt-0.5 block text-xs text-soft">{label}</span>
        </Link>
      </dd>
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
      {items.map((item) => (
        <div key={item.title}>
          <p className="text-sm font-semibold text-red">{item.title}</p>
          <p className="mt-0.5 text-sm text-soft">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

function relative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
