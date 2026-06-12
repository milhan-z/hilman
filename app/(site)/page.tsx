import Link from "next/link";
import { DrawAccent } from "@/components/draw-accent";
import { HeroRoles } from "@/components/hero-roles";
import { JournalCard } from "@/components/journal-card";
import { SectionReveal, Stagger, StaggerItem } from "@/components/motion";
import { ProjectCard } from "@/components/project-card";
import { Button, EntryMeta, Kicker, Marginalia, SectionHeading } from "@/components/ui";
import { getJournalPosts, getPage, getProjects, getSettings } from "@/lib/data";
import { STREAMS, type Stream } from "@/lib/types";

export const revalidate = 60;

const STREAM_ORDER: Stream[] = ["visual-design", "visual-stories", "digital-lab"];
const STREAM_DOT: Record<Stream, string> = {
  "visual-design": "bg-pen",
  "visual-stories": "bg-red",
  "digital-lab": "bg-cyan",
};

export default async function HomePage() {
  const [settings, projects, journal, home, about] = await Promise.all([
    getSettings(),
    getProjects(),
    getJournalPosts(),
    getPage("home"),
    getPage("about"),
  ]);

  const featured = projects.filter((p) => p.featured).slice(0, 3);
  const latestJournal = journal.slice(0, 2);
  const streamCounts = Object.fromEntries(
    STREAM_ORDER.map((s) => [s, projects.filter((p) => p.stream === s).length])
  ) as Record<Stream, number>;
  const currently: string[] = about?.data?.currently ?? [];

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
          <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-soft">
            {home?.data?.intro ??
              "Informatics student at ITS, connecting visuals, stories, systems, and technology into one creative language. This is my living archive — not a portfolio."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/works">Open the archive</Button>
            <Button href="/journal" variant="ghost">
              Read the journal
            </Button>
          </div>
        </div>

        {/* specimen plate — the notebook's front-plate */}
        <div className="flex items-center">
          <div className="dotgrid w-full rounded-md border border-line-strong bg-surface p-6 shadow-lift sm:p-7 lg:rotate-1">
            <div className="flex items-center justify-between border-b-2 border-pen/70 pb-3">
              <span className="font-mono text-2xs font-bold uppercase tracking-[0.2em] text-pen">Field Notebook</span>
              <span aria-hidden className="font-hand text-2xl leading-none text-red">✦</span>
            </div>
            <dl className="mt-4 space-y-2.5 font-mono text-xs">
              {[
                ["Keeper", "Hilman"],
                ["Field", "Design · Media · Tech"],
                ["Based", "Surabaya, Indonesia"],
                ["Edition", `No. ${new Date().getFullYear()}`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3">
                  <dt className="uppercase tracking-widest text-faint">{k}</dt>
                  <dd className="text-right font-semibold text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 border-t border-dashed border-line-strong pt-4">
              <p className="font-mono text-2xs uppercase tracking-widest text-faint">Contents</p>
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
                      <span className="font-mono text-2xs text-faint tnum group-hover:text-pen">
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

      {/* ══ The Index — table of contents ═════════════════ */}
      <SectionReveal>
        <section aria-labelledby="index-heading" className="border-t-2 border-line-strong pt-10">
          <div className="mb-6 flex items-center justify-between">
            <h2 id="index-heading" className="font-mono text-2xs uppercase tracking-[0.2em] text-faint">
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
                  <span className="font-mono text-sm font-semibold text-faint tnum transition-colors group-hover:text-pen">
                    {row.num}
                  </span>
                  <span className="min-w-0">
                    <span className="font-display text-xl font-semibold tracking-tight transition-colors group-hover:text-pen sm:text-2xl">
                      {row.name}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-soft">{row.desc}</span>
                  </span>
                  <span className="flex items-center gap-3 sm:gap-5">
                    <span className="hidden font-mono text-2xs uppercase tracking-wider text-faint sm:inline">
                      {row.meta}
                    </span>
                    <span aria-hidden className="text-faint transition-transform duration-fast group-hover:translate-x-1 group-hover:text-pen">
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </SectionReveal>

      {/* ══ Pinned work ═══════════════════════════════════ */}
      {featured.length > 0 && (
        <section className="mt-20" aria-labelledby="featured-heading">
          <SectionReveal>
            <SectionHeading index="✦" title="Pinned from the archive" hint="the highlighter ones" href="/works" hrefLabel="All works" />
          </SectionReveal>
          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" gap={0.1}>
            {featured.map((p, i) => (
              <StaggerItem key={p.id}>
                <ProjectCard project={p} priority={i === 0} index={i} />
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      {/* ══ From the journal ══════════════════════════════ */}
      {latestJournal.length > 0 && (
        <section className="mt-20" aria-labelledby="journal-heading">
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
