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
};

const streamKeys = Object.keys(STREAMS) as Stream[];

export default async function WorksPage(
  props: {
    searchParams: Promise<{ stream?: string; tag?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const initialStream = streamKeys.includes(searchParams.stream as Stream)
    ? (searchParams.stream as Stream)
    : undefined;
  const [projectsRes, tagsRes] = await Promise.all([load(() => getProjects()), load(getTags)]);
  const projects = projectsRes.ok ? projectsRes.value : [];
  const tags = tagsRes.ok ? tagsRes.value : [];

  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
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
        <WorksExplorer
          projects={projects}
          tags={tags}
          initialStream={initialStream}
          initialTag={searchParams.tag}
        />
      ) : (
        <div className="mt-10">
          <ContentUnavailable what="the archive" detail={projectsRes.error} />
        </div>
      )}
    </div>
  );
}
