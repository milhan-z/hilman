import Link from "next/link";
import { DrawAccent } from "@/components/draw-accent";
import { HeroRoles } from "@/components/hero-roles";
import { JournalCard } from "@/components/journal-card";
import { SectionReveal, Stagger, StaggerItem } from "@/components/motion";
import { ProjectCard } from "@/components/project-card";
import { Button, EmptyState, EntryMeta, Kicker, Marginalia, SectionHeading } from "@/components/ui";
import { getJournalPosts, getPage, getProjects, getSettings, load } from "@/lib/data";
import { ContentUnavailable, ContentUnavailablePage } from "@/components/content-unavailable";
import { STREAMS, type Stream } from "@/lib/types";

export const revalidate = 60;

const STREAM_ORDER: Stream[] = ["visual-design", "visual-stories", "digital-lab"];
const STREAM_DOT: Record<Stream, string> = {
  "visual-design": "bg-pen",
  "visual-stories": "bg-red",
  "digital-lab": "bg-cyan",
};

export default async function HomePage() {
  const [settingsRes, projectsRes, journalRes, homeRes, aboutRes] = await Promise.all([
    load(getSettings),
    load(() => getProjects()),
    load(getJournalPosts),
    load(() => getPage("home")),
    load(() => getPage("about")),
  ]);

  // Without settings there is no hero to render honestly.
  if (!settingsRes.ok) {
    return <ContentUnavailablePage what="the cover" detail={settingsRes.error} />;
  }

  const settings = settingsRes.value;
  const projects = projectsRes.ok ? projectsRes.value : [];
  const journal = journalRes.ok ? journalRes.value : [];
  const home = homeRes.ok ? homeRes.value : null;
  const about = aboutRes.ok ? aboutRes.value : null;

  const featured = projects.filter((p) => p.featured).slice(0, 3);
  // Falls back to the most recent published work so the home page never shows
  // an empty strip just because nothing has been starred yet.
  const showcase = featured.length ? featured : projects.slice(0, 3);
  const latestJournal = journal.slice(0, 2);
  const streamCounts = Object.fromEntries(
    STREAM_ORDER.map((s) => [s, projects.filter((p) => p.stream === s).length])
  ) as Record<Stream, number>;
  const currently: string[] = about?.data?.currently ?? [];

  // Identity rows only appear when they have been filled in — the template
  // used to state a campus and a city as fact.
  const plateRows: [string, string][] = [
    ["Keeper", "Hilman"],
    ...(home?.data?.field ? ([["Field", home.data.field]] as [string, string][]) : []),
    ...(home?.data?.based ? ([["Based", home.data.based]] as [string, string][]) : []),
    ["Edition", `No. ${new Date().getFullYear()}`],
  ];

  const indexRows = [
    { num: "01", name: "Works", href: "/works", desc: "Design, stories & code — filed by stream.", meta: `${projects.length} entries` },
    { num: "02", name: "Journal", href: "/journal", desc: "Notes that grow slowly, dated and in public.", meta: `${journal.length} entries` },
    { num: "03", name: "Lab", href: "/lab", desc: "Live experiments you can actually touch.", meta: "playground" },
    { num: "04", name: "About", href: "/about", desc: "Who’s behind the filing system.", meta: "profile" },
    { num: "05", name: "Connect", href: "/connect", desc: "Start a conversation — design, film, or code.", meta: "say hi" },
  ];

  return (
    <div className="mx-auto max-w-wide px-5 sm:px-8">
      {/* ══ Cover ══════════════════════════════════════════ */}
      <section className="glow-yellow grid gap-10 pb-16 pt-14 sm:pt-20 lg:grid-cols-[1.5fr_1fr] lg:gap-14 lg:pb-24">
        <div className="flex flex-col justify-center">
          <Kicker>this notebook belongs to —</Kicker>
          <div className="relative mt-4 inline-block w-fit">
            <h1 className="flex items-start font-display text-6xl font-bold leading-[0.95] tracking-tight sm:text-7xl">
              Hilman
              <span aria-hidden className="ml-2 mt-3 inline-block h-3 w-3 rounded-[2px] bg-red sm:mt-4" />
            </h1>
            <div className="absolute -bottom-2 left-0">
              <DrawAccent variant="underline2" color="yellow" width={260} strokeWidth={5} delay={0.35} />
            </div>
          </div>
          <p className="mt-7 max-w-xl text-2xl font-semibold leading-snug">
            <HeroRoles roles={settings.hero_roles} />
          </p>
          {/* No invented biography here: if the Home page record has no
              positioning sentence, nothing is claimed on Hilman's behalf. */}
          {home?.data?.intro && (
            <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-soft">
              {home.data.intro}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/works">See selected work</Button>
            <Button href="/connect" variant="ghost">
              Get in touch
            </Button>
          </div>
        </div>

        {/* specimen plate — the notebook's front-plate */}
        <div className="flex items-center">
          <div className="dotgrid w-full rounded-md border border-line-strong bg-surface p-6 shadow-lift sm:p-7 lg:rotate-1">
            <div className="flex items-center justify-between border-b-2 border-pen/70 pb-3">
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-pen">Field Notebook</span>
              <span aria-hidden className="font-hand text-2xl leading-none text-red">✦</span>
            </div>
            <dl className="mt-4 space-y-2.5 font-mono text-xs">
              {plateRows.map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="uppercase tracking-widest text-soft">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-dashed border-line-strong pt-4">
              <p className="font-mono text-xs uppercase tracking-widest text-soft">Contents</p>
              <ul className="mt-2.5 space-y-1.5">
                {STREAM_ORDER.map((s) => (
                  <li key={s}>
                    <Link
                      href={`/works?stream=${s}`}
                      className="group flex items-center justify-between gap-3 text-sm transition-colors hover:text-pen"
                    >
                      <span className="flex items-center gap-2.5 font-medium">
                        <span aria-hidden className={`h-2 w-2 rounded-full ${STREAM_DOT[s]}`} />
                        {STREAMS[s].name}
                      </span>
                      <span className="font-mono text-xs text-soft tnum group-hover:text-pen">
                        {String(streamCounts[s]).padStart(2, "0")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ══ Pinned work ═══════════════════════════════════ */}
      {/* Selected work comes before the index: a visitor should meet real work
          in the first scroll, not a table of contents. */}
      <section className="border-t-2 border-line-strong pt-10" aria-label="Selected work">
        <SectionReveal>
          <SectionHeading
            index="✦"
            title={showcase.length ? "Selected work" : "Work"}
            hint={featured.length ? "the highlighter ones" : undefined}
            href="/works"
            hrefLabel="All works"
          />
        </SectionReveal>
        {!projectsRes.ok ? (
          <ContentUnavailable what="the work" detail={projectsRes.error} compact />
        ) : showcase.length > 0 ? (
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" gap={0.1}>
            {showcase.map((p, i) => (
              <StaggerItem key={p.id}>
                <ProjectCard project={p} priority={i === 0} index={i} />
              </StaggerItem>
            ))}
          </Stagger>
        ) : (
          <EmptyState
            title="No published work yet."
            hint="the archive is being filled — check back soon"
          />
        )}
      </section>

      {/* ══ The Index — table of contents ═════════════════ */}
      <SectionReveal>
        <section aria-labelledby="index-heading" className="mt-20 border-t-2 border-line-strong pt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 id="index-heading" className="font-mono text-xs uppercase tracking-[0.2em] text-soft">
              Index — the worlds inside
            </h2>
            <Marginalia className="hidden -rotate-2 sm:block">start anywhere</Marginalia>
          </div>
          <ul className="border-t border-line">
            {indexRows.map((row) => (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className="group grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-line py-5 transition-colors duration-fast hover:bg-surface sm:grid-cols-[3rem_1fr_auto] sm:py-6"
                >
                  <span className="font-mono text-sm font-semibold text-soft tnum transition-colors group-hover:text-pen">
                    {row.num}
                  </span>
                  <span className="min-w-0">
                    <span className="font-display text-xl font-semibold tracking-tight transition-colors group-hover:text-pen sm:text-2xl">
                      {row.name}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-soft">{row.desc}</span>
                  </span>
                  <span className="flex items-center gap-3 sm:gap-5">
                    <span className="hidden font-mono text-xs uppercase tracking-wider text-soft sm:inline">
                      {row.meta}
                    </span>
                    <span aria-hidden className="text-soft transition-transform duration-fast group-hover:translate-x-1 group-hover:text-pen">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </SectionReveal>

      {/* ══ From the journal ══════════════════════════════ */}
      {latestJournal.length > 0 && (
        <section className="mt-20" aria-label="From the journal">
          <SectionReveal>
            <SectionHeading index="✎" title="How I think, in public" href="/journal" hrefLabel={home?.data?.journal_hook ?? "Wander the journal"} />
          </SectionReveal>
          <Stagger className="grid gap-5 lg:grid-cols-2" gap={0.1}>
            {latestJournal.map((post) => (
              <StaggerItem key={post.id}>
                <JournalCard post={post} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* ══ Currently + Connect — the closing desk note ═══ */}
      <SectionReveal>
        <section className="mb-12 mt-20 grid gap-6 lg:grid-cols-[1fr_1fr]" aria-labelledby="closing-heading">
          {currently.length > 0 && (
            <div className="ruled rounded-md border border-line bg-raise p-7 shadow-card">
              <EntryMeta items={["Currently", "in progress"]} />
              <ul className="mt-4 space-y-3">
                {currently.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-soft">
                    <span aria-hidden className="text-pen">→</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="glow-yellow flex flex-col justify-center rounded-md border border-line bg-surface p-7 shadow-card">
            <h2 id="closing-heading" className="font-display text-2xl font-semibold leading-snug tracking-tight">
              Building something that needs <span className="hl-mark">design, story, and code</span>?
            </h2>
            <p className="mt-3 text-soft">
              That overlap is exactly where I like to work. Tell me about it — my inbox is friendlier
              than it looks.
            </p>
            <div className="mt-6">
              <Button href="/connect">Start a conversation</Button>
            </div>
          </div>
        </section>
      </SectionReveal>
    </div>
  );
}
