import type { Metadata } from "next";
import { DrawAccent } from "@/components/draw-accent";
import { ArrowLink, Button, Kicker } from "@/components/ui";
import { WorksExplorer } from "@/components/works-explorer";
import { getProjects, getTags, load } from "@/lib/data";
import { ContentUnavailable } from "@/components/content-unavailable";
import { STREAMS, type Stream } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Works",
  description: "Design, film, photography, and code by Hilman — with the process and thinking behind each project.",
  // ?stream= and ?tag= are views of this one page, not pages of their own.
  alternates: { canonical: "/works" },
};

const streamKeys = Object.keys(STREAMS) as Stream[];

/**
 * Static, like every other index, and it did not used to be.
 *
 * Reading `searchParams` here made /works the one public page rendered on
 * every request: a server round trip and three database reads before the
 * archive could appear, for a filter the explorer applies in the browser
 * anyway. The page now renders once (ISR) with every project, and
 * <WorksExplorer /> picks the stream and tag up from the address itself.
 */
export default async function WorksPage() {
  const [projectsRes, tagsRes] = await Promise.all([load(() => getProjects()), load(getTags)]);
  const projects = projectsRes.ok ? projectsRes.value : [];
  // Only tags some project here carries. Tags are made from the editor now,
  // journal entries included, and a filter that empties the grid is a dead end.
  const used = new Set(projects.flatMap((project) => (project.tags ?? []).map((tag) => tag.id)));
  const tags = tagsRes.ok ? tagsRes.value.filter((tag) => used.has(tag.id)) : [];

  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8 lg:px-12">
      <header className="max-w-2xl">
        <Kicker>ideas, made into something</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Works</h1>
          <div className="absolute -bottom-1 left-0">
            <DrawAccent variant="underline" color="yellow" width={150} strokeWidth={4} />
          </div>
        </div>
        <p className="mt-5 text-lg text-pretty leading-relaxed text-soft">
          Design, film, photography, and code. A place for the things I make,
          the decisions along the way, and the people I make them with.
        </p>
      </header>

      {projectsRes.ok && projects.length === 0 ? (
        <section className="mt-12 grid gap-8 rounded-lg border border-line bg-surface p-7 sm:p-10 lg:grid-cols-[1.1fr_1fr]" aria-labelledby="work-note">
          <div><p className="font-hand text-2xl text-pen">a note from me</p><h2 id="work-note" className="mt-4 font-display text-3xl font-semibold tracking-tight">The work deserves its story.</h2><p className="mt-4 max-w-md text-soft">I’m putting together my selected projects, including what I contributed and how each one came together. In the meantime, you can get to know me or try a little experiment.</p><div className="mt-6 flex flex-wrap gap-3"><Button href="/about">Meet Hilman</Button><Button href="/lab" variant="ghost">Explore the Lab</Button></div></div>
          <div className="border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">{streamKeys.map((stream) => <div key={stream} className="border-b border-line py-4 first:pt-0 last:border-0"><h3 className="font-display text-xl font-medium">{STREAMS[stream].name}</h3><p className="mt-1 text-sm text-soft">{STREAMS[stream].tagline}</p></div>)}<ArrowLink href="/connect" className="mt-5">Have a project in mind?</ArrowLink></div>
        </section>
      ) : projectsRes.ok ? (
        <WorksExplorer projects={projects} tags={tags} />
      ) : (
        <div className="mt-10">
          <ContentUnavailable what="the archive" detail={projectsRes.error} />
        </div>
      )}
    </div>
  );
}
