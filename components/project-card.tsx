import Link from "next/link";
import { Pic } from "./cld-image";
import { Tag } from "./ui";
import { STREAMS, type Project } from "@/lib/types";

export function ProjectCard({ project, priority = false }: { project: Project; priority?: boolean }) {
  return (
    <Link
      href={`/works/${project.slug}`}
      className="group relative block overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-all duration-base ease-out hover:-translate-y-1 hover:shadow-lift focus-visible:-translate-y-1"
    >
      {project.featured && (
        <span className="absolute right-3 top-3 z-10 rounded-sm bg-hl px-2 py-0.5 font-hand text-base text-hl-ink shadow-sticky">
          pinned
        </span>
      )}
      <div className="relative aspect-[4/3] overflow-hidden bg-n-100">
        <Pic
          src={project.thumbnail_public_id}
          alt={`${project.title} — ${project.subtitle ?? STREAMS[project.stream].name}`}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="transition-transform duration-slow ease-out group-hover:scale-[1.03]"
        />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2 text-xs text-faint">
          <span className="font-medium uppercase tracking-wider">{STREAMS[project.stream].name}</span>
          {project.year && <span className="font-hand text-base">’{String(project.year).slice(2)}</span>}
        </div>
        <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug transition-colors duration-fast group-hover:text-pen">
          {project.title}
        </h3>
        {project.subtitle && <p className="mt-1 text-sm text-soft">{project.subtitle}</p>}
        {project.tags && project.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {project.tags.slice(0, 3).map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
