import Link from "next/link";
import { Pic } from "./cld-image";
import { Stamp, Tag } from "./ui";
import { STREAMS, type Project } from "@/lib/types";
import { cn } from "@/lib/utils";

const STREAM_SHORT: Record<string, string> = {
  "visual-design": "DESIGN",
  "visual-stories": "STORIES",
  "digital-lab": "LAB",
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
  return (
    <Link
      href={`/works/${project.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-md border border-line bg-surface shadow-card transition-all duration-base ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-lift focus-visible:-translate-y-1"
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
          className="transition-transform duration-slow ease-out group-hover:scale-[1.04]"
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
        {project.subtitle && <p className="mt-1.5 text-sm leading-relaxed text-soft">{project.subtitle}</p>}
        {project.tags && project.tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {project.tags.slice(0, 3).map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
