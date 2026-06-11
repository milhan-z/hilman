import type { Metadata } from "next";
import { ProjectCard } from "@/components/project-card";
import { EmptyState, Tag } from "@/components/ui";
import { getProjects, getTags } from "@/lib/data";
import { STREAMS, type Stream } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Works",
  description:
    "The archive — visual design, visual stories, and digital lab projects by Hilman.",
};

const streamKeys = Object.keys(STREAMS) as Stream[];

export default async function WorksPage({
  searchParams,
}: {
  searchParams: { stream?: string; tag?: string };
}) {
  const stream = streamKeys.includes(searchParams.stream as Stream)
    ? (searchParams.stream as Stream)
    : undefined;
  const tag = searchParams.tag;
  const [projects, tags] = await Promise.all([getProjects({ stream, tag }), getTags()]);

  const buildHref = (s?: Stream, t?: string) => {
    const params = new URLSearchParams();
    if (s) params.set("stream", s);
    if (t) params.set("tag", t);
    const q = params.toString();
    return q ? `/works?${q}` : "/works";
  };

  return (
    <div className="mx-auto max-w-content px-5 py-16 sm:px-8">
      <header className="max-w-2xl">
        <p className="font-hand text-xl text-faint">the archive, properly filed</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          {stream ? STREAMS[stream].name : "Works"}
        </h1>
        <p className="mt-4 text-lg text-soft">
          {stream
            ? STREAMS[stream].blurb
            : "One desk, three worlds. Everything here started as a sketch in the margins — these are the ones that grew up."}
        </p>
      </header>

      {/* stream tabs */}
      <nav aria-label="Work streams" className="mt-10 flex flex-wrap gap-2 border-b border-line pb-px">
        {[undefined, ...streamKeys].map((s) => {
          const active = stream === s;
          return (
            <a
              key={s ?? "all"}
              href={buildHref(s, tag)}
              aria-current={active ? "page" : undefined}
              className={`min-h-[44px] rounded-t-lg border border-b-0 px-4 py-2.5 text-sm transition-colors duration-fast ${
                active
                  ? "border-line bg-surface font-medium text-ink shadow-[inset_0_3px_0_var(--hl)]"
                  : "border-transparent text-soft hover:text-ink"
              }`}
            >
              {s ? STREAMS[s].name : "Everything"}
            </a>
          );
        })}
      </nav>

      {/* tag filter */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="font-hand text-lg text-faint">filter by tag:</span>
        {tags.map((t) => (
          <Tag key={t.id} href={buildHref(stream, tag === t.slug ? undefined : t.slug)} active={tag === t.slug}>
            {t.name}
          </Tag>
        ))}
      </div>

      {/* grid */}
      <div className="mt-10">
        {projects.length === 0 ? (
          <EmptyState
            title="Nothing filed here yet."
            hint="try a different tab, or clear the tag filter"
          />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p, i) => (
              <ProjectCard key={p.id} project={p} priority={i < 3} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
