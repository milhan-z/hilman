import Link from "next/link";
import { EditorialReveal } from "@/components/bits/editorial-reveal";
import { HandDrawnReveal } from "@/components/bits/hand-drawn-reveal";
import { Pic } from "@/components/cld-image";
import { JournalCard } from "@/components/journal-card";
import { ProjectCard } from "@/components/project-card";
import { Button, ArrowLink, Kicker, SectionHeading } from "@/components/ui";
import { ContentUnavailable } from "@/components/content-unavailable";
import { NotebookPlay } from "@/components/notebook-play";
import { getJournalPosts, getPage, getProjects, load } from "@/lib/data";
import { resolveProfileData } from "@/lib/profile";
import { mediaSrc } from "@/lib/cloudinary";

export const revalidate = 60;

const practices = [
  { label: "Design", note: "Giving ideas a visual voice.", detail: "Graphic design, layouts, and visual communication.", href: "/works?stream=visual-design", mark: "Aa", color: "text-pen" },
  { label: "Film & photo", note: "Keeping a moment, telling a story.", detail: "Photography, video editing, and motion.", href: "/works?stream=visual-stories", mark: "↗", color: "text-red" },
  { label: "Code", note: "Making the idea work.", detail: "Web experiences, little tools, and experiments.", href: "/works?stream=digital-lab", mark: "{ }", color: "text-cyan" },
];

export default async function HomePage() {
  const [projectsRes, journalRes, homeRes, aboutRes] = await Promise.all([
    load(getProjects), load(getJournalPosts), load(() => getPage("home")), load(() => getPage("about")),
  ]);
  const home = resolveProfileData("home", homeRes.ok ? homeRes.value?.data : undefined);
  const about = resolveProfileData("about", aboutRes.ok ? aboutRes.value?.data : undefined);
  const projects = projectsRes.ok ? projectsRes.value : [];
  const featured = projects.filter((project) => project.featured);
  const showcase = (featured.length ? featured : projects).slice(0, 3);
  const journal = journalRes.ok ? journalRes.value.slice(0, 2) : [];
  const portrait = mediaSrc(home.portrait) ? home.portrait : undefined;

  return (
    <div className="mx-auto max-w-wide px-5 sm:px-8 lg:px-12">
      <section className="personal-hero relative grid gap-10 pb-12 pt-10 sm:py-16 lg:grid-cols-[1.25fr_1fr] lg:items-center lg:gap-16 lg:py-20" aria-labelledby="hello-heading">
        <div className="relative z-10">
          <Kicker className="text-pen">a little corner of my world</Kicker>
          <h1 id="hello-heading" className="mt-5 font-display text-[clamp(3.4rem,7.5vw,7.4rem)] font-semibold leading-[0.95] tracking-[-0.055em]">
            Hello, I’m<br />
            {/* The one signature moment on this screen: the highlighter
                swept under the name, once the lines below it have arrived.
                The brush is the stroke this name always had — same place,
                same weight, same tilt — and it sweeps on the compositor, so
                unlike the pen it repaints nothing while the first screen is
                still settling. */}
            <span className="relative inline-block">
              Hilman<span className="text-pen">.</span>
              <span aria-hidden className="absolute -bottom-[0.09em] left-0 right-[8%]">
                <HandDrawnReveal variant="brush" tone="hl" delay={500} duration={700} />
              </span>
            </span>
          </h1>
          {/* The title is the first paint; what it says about itself follows. */}
          <EditorialReveal stagger={60}>
            {home.headline && <p className="mt-7 max-w-md whitespace-pre-line text-xl font-medium leading-snug sm:text-2xl">{home.headline}</p>}
            {home.intro && <p className="mt-4 max-w-xl text-base leading-relaxed text-soft sm:text-lg">{home.intro}</p>}
            <div className="mt-7 flex flex-wrap gap-3">
              <Button href={showcase.length ? "#selected-work" : "/about"}>{showcase.length ? "Explore my work" : "A little about me"}<span aria-hidden>↗</span></Button>
              <Button href="/connect" variant="ghost">Let’s make something</Button>
            </div>
            <div className="mt-7 flex items-center gap-3 text-xs text-soft"><span className="h-px w-8 shrink-0 bg-line-strong" aria-hidden /><span>Informatics at ITS{home.field ? ` · ${home.field}` : ""}{home.based ? ` · ${home.based}` : ""}</span></div>
          </EditorialReveal>
        </div>
        <div className="relative hidden min-w-0 lg:block">
          {/* The note belongs to the paper above it: it takes the paper's
              width and angle and hangs just clear of its bottom edge.
              Placed against the column instead, it started left of the
              notebook and, tilted further than it, ran up into the
              notebook's corner. Still out of the flow, so the hero is laid
              out exactly as before. */}
          <div className={`relative ${portrait ? "mx-auto max-w-sm" : "ml-auto max-w-[430px]"}`}>
            {portrait ? (
              <figure className="portrait-paper rotate-2">
                <Pic src={portrait} alt={home.portrait_alt || "Hilman"} width={720} height={850} priority className="aspect-[4/5] w-full object-cover" sizes="380px" />
                {home.portrait_caption && <figcaption className="px-2 pb-1 pt-4 font-hand text-xl text-cream-ink">{home.portrait_caption}</figcaption>}
              </figure>
            ) : (
              <div className="notebook-cover relative -rotate-2 px-9 pb-10 pt-9">
                <div className="flex items-center justify-between border-b border-cream-line pb-4 font-mono text-xs uppercase tracking-[0.15em]"><span>A personal notebook</span><span aria-hidden>✳</span></div>
                <p className="mt-9 font-display text-[3.7rem] font-semibold leading-[0.95] tracking-tight">Ideas.<br />People.<br /><span className="italic">Possibilities.</span></p>
                <p className="mt-8 max-w-[15rem] font-hand text-2xl leading-tight">{home.note}</p>
                <div className="mt-9 flex items-center justify-between border-t border-cream-line pt-4"><span className="font-mono text-xs">HILMAN / OPEN NOTEBOOK</span><span className="font-hand text-3xl">h.</span></div>
                <span aria-hidden className="absolute -right-4 top-20 rotate-12 rounded-sm bg-hl px-5 py-3 font-hand text-2xl text-hl-ink shadow-sticky">stay curious ↗</span>
              </div>
            )}
            <span aria-hidden className={`absolute inset-x-0 top-full mt-5 font-hand text-2xl text-soft ${portrait ? "rotate-2 pl-3" : "-rotate-2 pl-9"}`}>a work in progress, like me</span>
          </div>
        </div>
      </section>
      <section id="selected-work" className="scroll-mt-24 border-t border-line-strong pt-9" aria-label={showcase.length ? "Selected work" : "Creative interests"}>
        <EditorialReveal trigger="view"><SectionHeading index="01" title={showcase.length ? "A few things I’ve made" : "The things I love exploring"} href={showcase.length ? "/works" : undefined} hrefLabel="All work" /></EditorialReveal>
        {!projectsRes.ok ? <ContentUnavailable what="the work" compact /> : showcase.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{showcase.map((project, index) => <ProjectCard key={project.id} project={project} index={index} />)}</div>
        ) : (
          <div className="grid gap-0 overflow-hidden rounded-lg border border-line sm:grid-cols-3">
            {practices.map((practice) => <Link key={practice.label} href={practice.href} className="practice-link group flex flex-col border-b border-line bg-surface p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 lg:p-8">
              <span aria-hidden className={`mb-7 font-display text-4xl ${practice.color}`}>{practice.mark}</span>
              <h3 className="font-display text-xl font-semibold">{practice.label}<span aria-hidden className="float-right text-soft transition-transform group-hover:-translate-y-1 group-hover:translate-x-1">↗</span></h3>
              <p className="mt-2 text-sm text-ink">{practice.note}</p><p className="mt-2 text-sm leading-relaxed text-soft">{practice.detail}</p>
            </Link>)}
          </div>
        )}
      </section>
      {about.community_story && <section className="my-16 grid gap-8 border-y border-line py-10 sm:my-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-14" aria-label="People and collaboration">
        <div><Kicker>more than what’s on the screen</Kicker>{about.community_heading && <h2 id="people-heading" className="mt-4 max-w-md font-display text-3xl font-semibold tracking-tight sm:text-4xl">{about.community_heading}</h2>}</div>
        <div><p className="max-w-xl text-lg leading-relaxed text-soft">{about.community_story}</p><div className="mt-6"><ArrowLink href="/about#people">Meet the person behind the work</ArrowLink></div></div>
      </section>}
      <section className="mt-16 grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-14" aria-label="Notes and experiments">
        <div>
          <EditorialReveal trigger="view"><SectionHeading index="02" title="Notes along the way" href="/journal" hrefLabel={home.journal_hook} /></EditorialReveal>
          {!journalRes.ok ? <ContentUnavailable what="the journal" compact /> : journal.length ? <div className="space-y-4">{journal.map((post) => <JournalCard key={post.id} post={post} />)}</div> : (
            <div className="ruled rounded-lg border border-line bg-surface p-7 sm:p-9"><span className="font-hand text-2xl text-pen">There’s room for the unfinished.</span><p className="mt-4 max-w-md text-soft">This is where I’ll share moments, things I’m learning, and the thinking behind the work. The first notes are still taking shape.</p><div className="mt-6"><ArrowLink href="/about">For now, get to know me</ArrowLink></div></div>
          )}
        </div>
        <div><EditorialReveal trigger="view"><SectionHeading index="03" title="A little room to play" /></EditorialReveal><NotebookPlay /><div className="mt-5"><ArrowLink href="/lab">More experiments in the Lab</ArrowLink></div></div>
      </section>
      <section className="my-16 flex flex-col justify-between gap-7 rounded-lg border border-line-strong bg-surface p-7 sm:my-20 sm:p-10 lg:flex-row lg:items-center" aria-labelledby="connect-heading">
        <div><Kicker className="text-pen">new ideas start with a hello</Kicker><h2 id="connect-heading" className="mt-4 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Let’s make something <span className="relative inline-block italic">together.<span aria-hidden className="absolute -bottom-2 left-0 right-1"><HandDrawnReveal variant="underline" trigger="view" fluid strokeWidth={3} /></span></span></h2><p className="mt-3 max-w-xl text-soft">A creative project, a tech idea, a new opportunity — or just a good conversation.</p></div>
        <Button href="/connect" className="self-start lg:shrink-0">Say hello <span aria-hidden>↗</span></Button>
      </section>
    </div>
  );
}
