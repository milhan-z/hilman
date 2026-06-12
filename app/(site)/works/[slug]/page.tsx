import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/renderer";
import { Pic } from "@/components/cld-image";
import { PrevNext } from "@/components/prev-next";
import { ArrowLink, EntryMeta, Stamp, Tag } from "@/components/ui";
import { getProjectBySlug, getProjects } from "@/lib/data";
import { mediaSrc } from "@/lib/cloudinary";
import { STREAMS } from "@/lib/types";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const project = await getProjectBySlug(params.slug);
  if (!project) return {};
  const og = mediaSrc(project.cover_public_id ?? project.thumbnail_public_id, { width: 1200 });
  return {
    title: project.title,
    description: project.excerpt ?? project.subtitle ?? undefined,
    openGraph: og ? { images: [{ url: og }] } : undefined,
  };
}

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug);
  if (!project) notFound();

  const meta = project.meta ?? {};

  const all = await getProjects();
  const idx = all.findIndex((p) => p.slug === project.slug);
  const prevP = idx > 0 ? all[idx - 1] : null;
  const nextP = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const toItem = (p: typeof prevP) =>
    p ? { href: `/works/${p.slug}`, title: p.title, kicker: STREAMS[p.stream].name } : null;

  return (
    <article className="pb-20">
      {/* cover */}
      {project.cover_public_id && (
        <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden border-b-2 border-ink/80 sm:h-[56vh]">
          <Pic src={project.cover_public_id} alt={`${project.title} — cover`} fill priority sizes="100vw" />
        </div>
      )}

      <div className="mx-auto max-w-wide px-5 sm:px-8">
        {/* entry header — an overlapping filed card */}
        <header
          className={`relative z-10 mx-auto max-w-3xl rounded-md border border-line-strong bg-surface p-7 shadow-lift sm:p-10 ${
            project.cover_public_id ? "-mt-16 sm:-mt-20" : "mt-12"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <EntryMeta
              items={[STREAMS[project.stream].name, project.year ? String(project.year) : null]}
            />
            {project.featured && <Stamp tone="hl">pinned</Stamp>}
          </div>
          <h1 className="mt-4 font-display text-4xl font-bold leading-[1.04] tracking-tight sm:text-5xl">
            {project.title}
          </h1>
          {project.subtitle && <p className="mt-3 text-lg leading-relaxed text-soft">{project.subtitle}</p>}

          <dl className="mt-7 grid gap-x-8 gap-y-4 border-t border-dashed border-line-strong pt-6 text-sm sm:grid-cols-3">
            {meta.role && (
              <div>
                <dt className="font-mono text-2xs uppercase tracking-widest text-faint">Role</dt>
                <dd className="mt-1">{meta.role}</dd>
              </div>
            )}
            {meta.tools && meta.tools.length > 0 && (
              <div>
                <dt className="font-mono text-2xs uppercase tracking-widest text-faint">Tools</dt>
                <dd className="mt-1">{meta.tools.join(", ")}</dd>
              </div>
            )}
            {meta.client && (
              <div>
                <dt className="font-mono text-2xs uppercase tracking-widest text-faint">For</dt>
                <dd className="mt-1">{meta.client}</dd>
              </div>
            )}
          </dl>

          {(project.tags?.length || meta.links?.length) && (
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {project.tags?.map((t) => (
                <Tag key={t.id} href={`/works?tag=${t.slug}`}>
                  {t.name}
                </Tag>
              ))}
              {meta.links?.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto text-sm font-medium text-pen underline-offset-4 hover:underline"
                >
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}
        </header>

        {/* body — block engine */}
        <div className="mt-14 w-full">
          <BlockRenderer blocks={project.blocks ?? []} />
        </div>

        <footer className="mx-auto mt-20 max-w-3xl border-t-2 border-line-strong pt-8">
          <PrevNext prev={toItem(prevP)} next={toItem(nextP)} label="project" />
          <div className="mt-8">
            <ArrowLink href="/works" back>
              Back to the archive
            </ArrowLink>
          </div>
        </footer>
      </div>
    </article>
  );
}
