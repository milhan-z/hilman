import { PaperCard } from "./bits/paper-card";
import { Pic } from "./cld-image";
import { Stamp, Tag } from "./ui";
import { ReaderTally } from "./reader-count";
import { STREAMS, type Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const STREAM_SHORT: Record<string, string> = {
  "visual-design": "DESIGN",
  "visual-stories": "FILM & PHOTO",
  "digital-lab": "CODE",
};

const STREAM_COLOR: Record<string, string> = {
  "visual-design": "text-pen",
  "visual-stories": "text-red",
  "digital-lab": "text-cyan",
};

export function ProjectCard({
  project,
  priority = false,
  index,
}: {
  project: Project;
  priority?: boolean;
  index?: number;
}) {
  const cat = index != null ? String(index + 1).padStart(2, "0") : String(project.sort_order).padStart(2, "0");
  const tags = project.tags ?? [];
  return (
    <PaperCard
      href={`/works/${project.slug}`}
      seed={project.id}
      // No overflow-hidden here: it would clip the lifted shadow. The photo
      // clips itself, and it never reaches the card's rounded corners.
      className="group flex flex-col rounded-md border border-line bg-surface hover:border-line-strong"
    >
      {/* filed-under header */}
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span
          className={cn(
            "font-mono text-2xs font-semibold uppercase tracking-widest",
            STREAM_COLOR[project.stream] ?? "text-pen"
          )}
        >
          {STREAM_SHORT[project.stream] ?? STREAMS[project.stream].name}
        </span>
        <span className="font-mono text-2xs text-faint tnum">No.{cat}</span>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden bg-n-100">
        <Pic
          src={project.thumbnail_public_id}
          alt={`${project.title} — ${project.subtitle ?? STREAMS[project.stream].name}`}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        {project.featured && (
          <span className="absolute right-2.5 top-2.5">
            <Stamp tone="hl" className="shadow-sticky">pinned</Stamp>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold leading-snug tracking-tight transition-colors duration-fast group-hover:text-pen">
            {project.title}
          </h3>
          {project.year && (
            <span className="shrink-0 font-mono text-2xs text-faint tnum">
              ’{String(project.year).slice(2)}
            </span>
          )}
        </div>
        {(project.subtitle || project.excerpt) && <p className="mt-1.5 text-sm leading-relaxed text-soft">{project.subtitle || project.excerpt}</p>}
        {project.meta?.role && <p className="mt-3 text-xs text-soft"><span className="text-ink">My part:</span> {project.meta.role}</p>}
        {/* Always there, and gone while it holds nothing: the count may only be
            known once this browser has looked in its memory. */}
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 empty:hidden">
          {tags.slice(0, 3).map((t) => (
            <Tag key={t.id}>{t.name}</Tag>
          ))}
          <ReaderTally
            kind="project"
            id={project.id}
            reads={project.reads}
            className="ml-auto pl-2 font-mono text-2xs uppercase tracking-wider text-faint tnum"
          />
        </div>
      </div>
    </PaperCard>
  );
}
