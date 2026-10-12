import Link from "next/link";
import { Pic } from "@/components/cld-image";
import { ArrowLink } from "@/components/ui";
import { mediaSrc } from "@/lib/cloudinary";
import { STREAMS, type Project } from "@/lib/types";

/** A complete, server-rendered proof: the work and the author's own context.
 * No invented outcome, placeholder image, or reveal required to read it. */
export function HomeProject({ project, index }: { project: Project; index: number }) {
  const image = [project.cover_public_id, project.thumbnail_public_id].find((src) => mediaSrc(src));
  const heading = `home-project-${project.id}`;
  const href = `/works/${project.slug}`;
  const graphic = project.stream === "visual-design";

  return (
    <article aria-labelledby={heading} className="home-project border-b border-line py-10 sm:py-16">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 font-mono text-xs uppercase tracking-widest text-soft">
        <span>{String(index + 1).padStart(2, "0")} / {STREAMS[project.stream].name}</span>
        {project.year && <span>{project.year}</span>}
      </div>
      {image && (
        <Link href={href} aria-label={`View ${project.title}`} className={`block rounded-sm focus-visible:outline-offset-4 ${graphic ? "bg-cream p-4 sm:p-8" : "bg-surface"}`}>
          <Pic src={image} alt={`${project.title} — ${project.subtitle || "project image"}`} width={1600} height={1000}
            sizes="(max-width: 1280px) 100vw, 1200px"
            className={`mx-auto w-full object-contain ${graphic ? "max-h-[75vh]" : "max-h-[85vh]"}`} />
        </Link>
      )}
      <div className="mt-7 grid min-w-0 gap-5 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="min-w-0">
          <h3 id={heading} className="break-words font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            <Link href={href} className="hover:text-pen">{project.title}</Link>
          </h3>
          {project.subtitle && <p className="mt-3 text-lg text-soft">{project.subtitle}</p>}
        </div>
        <div className="min-w-0">
          {project.excerpt && project.excerpt !== project.subtitle && <p className="whitespace-pre-line text-base leading-relaxed text-soft sm:text-lg">{project.excerpt}</p>}
          {project.meta?.role && <dl className="mt-5 border-l-2 border-hl pl-4">
            <dt className="font-mono text-xs uppercase tracking-widest text-soft">My contribution</dt>
            <dd className="mt-1 whitespace-pre-line break-words text-base">{project.meta.role}</dd>
          </dl>}
          <ArrowLink href={href} className="mt-5 min-h-[44px]">Explore the project</ArrowLink>
        </div>
      </div>
    </article>
  );
}
