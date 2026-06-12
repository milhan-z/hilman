import type { Metadata } from "next";
import { DrawAccent } from "@/components/draw-accent";
import { Kicker } from "@/components/ui";
import { WorksExplorer } from "@/components/works-explorer";
import { getProjects, getTags } from "@/lib/data";
import { STREAMS, type Stream } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Works",
  description: "The archive — visual design, visual stories, and digital lab projects by Hilman.",
};

const streamKeys = Object.keys(STREAMS) as Stream[];

export default async function WorksPage({
  searchParams,
}: {
  searchParams: { stream?: string; tag?: string };
}) {
  const initialStream = streamKeys.includes(searchParams.stream as Stream)
    ? (searchParams.stream as Stream)
    : undefined;
  const [projects, tags] = await Promise.all([getProjects(), getTags()]);

  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
      <header className="max-w-2xl">
        <Kicker>the archive, properly filed</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Works</h1>
          <div className="absolute -bottom-1 left-0">
            <DrawAccent variant="underline" color="yellow" width={150} strokeWidth={4} />
          </div>
        </div>
        <p className="mt-5 text-lg text-pretty leading-relaxed text-soft">
          One desk, three worlds — design, stories, and code. Switch streams below; everything filters
          on the spot, no page reloads.
        </p>
      </header>

      <WorksExplorer
        projects={projects}
        tags={tags}
        initialStream={initialStream}
        initialTag={searchParams.tag}
      />
    </div>
  );
}
