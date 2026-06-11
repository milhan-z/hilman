import Link from "next/link";
import { HeroRoles } from "@/components/hero-roles";
import { JournalCard } from "@/components/journal-card";
import { SectionReveal } from "@/components/motion";
import { ProjectCard } from "@/components/project-card";
import { Button, Marginalia, SectionHeading, StickyNote } from "@/components/ui";
import { getFeaturedProjects, getJournalPosts, getPage, getSettings } from "@/lib/data";

export const revalidate = 60;

export default async function HomePage() {
  const [settings, featured, journal, home] = await Promise.all([
    getSettings(),
    getFeaturedProjects(3),
    getJournalPosts(),
    getPage("home"),
  ]);
  const latestJournal = journal.slice(0, 2);

  return (
    <div className="mx-auto max-w-content px-5 sm:px-8">
      {/* ── Hero ─────────────────────────────────────── */}
      <section className="dotgrid relative -mx-5 px-5 pb-20 pt-20 sm:-mx-8 sm:px-8 sm:pb-28 sm:pt-28">
        <div className="mx-auto max-w-content">
          <p className="font-hand text-xl text-faint">hello, you found my archive</p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            I’m Hilman<span className="text-pen">.</span>
            <br />
            <span className="mt-2 block text-2xl font-semibold text-soft sm:text-3xl">
              <HeroRoles roles={settings.hero_roles} />
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-soft">
            {home?.data?.intro ??
              "A creative technologist working between design, media, and code — this is my living archive, not a portfolio."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/works">Open the archive</Button>
            <Button href="/about" variant="ghost">
              Who’s Hilman?
            </Button>
          </div>
          <div className="pointer-events-none absolute right-8 top-16 hidden rotate-3 lg:block">
            <StickyNote color="yellow" className="w-44">
              three worlds, one desk: design · media · tech
            </StickyNote>
          </div>
        </div>
      </section>

      {/* ── Featured works ───────────────────────────── */}
      <SectionReveal>
        <section className="mt-20" aria-labelledby="featured-heading">
          <SectionHeading index="01" title="Pinned from the archive" hint="the highlighter ones" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((p, i) => (
              <ProjectCard key={p.id} project={p} priority={i === 0} />
            ))}
          </div>
          <div className="mt-8">
            <Link href="/works" className="text-sm font-medium text-pen underline-offset-4 hover:underline">
              Browse all works →
            </Link>
          </div>
        </section>
      </SectionReveal>

      {/* ── Journal hook ─────────────────────────────── */}
      <SectionReveal>
        <section className="mt-24" aria-labelledby="journal-heading">
          <SectionHeading index="02" title="How I think, in public" />
          <div className="grid gap-6 lg:grid-cols-2">
            {latestJournal.map((post) => (
              <JournalCard key={post.id} post={post} />
            ))}
          </div>
          <div className="mt-8">
            <Link href="/journal" className="text-sm font-medium text-pen underline-offset-4 hover:underline">
              {home?.data?.journal_hook ?? "Wander the journal →"}
            </Link>
          </div>
        </section>
      </SectionReveal>

      {/* ── Desk teaser ──────────────────────────────── */}
      <SectionReveal>
        <section className="mt-24" aria-labelledby="desk-heading">
          <div className="ruled relative overflow-hidden rounded-xl border border-line bg-surface p-8 shadow-card sm:p-12">
            <Marginalia className="absolute right-6 top-5 hidden -rotate-3 sm:block">
              don’t mind the mess
            </Marginalia>
            <SectionHeading index="03" title="The desk is open" />
            <p className="max-w-lg text-soft">
              Sticky notes, open folders, this week’s checklist — a small interactive corner of my
              actual working life. You can even move things around.
            </p>
            <div className="mt-6">
              <Button href="/desk" variant="hl">
                Sit at the desk
              </Button>
            </div>
          </div>
        </section>
      </SectionReveal>

      {/* ── Connect ──────────────────────────────────── */}
      <SectionReveal>
        <section className="mb-8 mt-24 text-center" aria-labelledby="connect-heading">
          <p className="font-hand text-xl text-faint">one more thing —</p>
          <h2 id="connect-heading" className="mt-2 font-display text-2xl font-semibold">
            Working on something that needs <span className="hl-mark">design, story, and code</span>?
          </h2>
          <p className="mx-auto mt-3 max-w-md text-soft">
            That overlap is exactly where I like to work. Tell me about it.
          </p>
          <div className="mt-6">
            <Button href="/connect">Start a conversation</Button>
          </div>
        </section>
      </SectionReveal>
    </div>
  );
}
