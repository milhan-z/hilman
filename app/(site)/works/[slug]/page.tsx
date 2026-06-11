import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/renderer";
import { Pic } from "@/components/cld-image";
import { Tag } from "@/components/ui";
import { getProjectBySlug } from "@/lib/data";
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

  return (
    <article className="pb-16">
      {/* cover */}
      {project.cover_public_id && (
        <div className="relative h-[42vh] min-h-[280px] w-full overflow-hidden border-b border-line sm:h-[55vh]">
          <Pic
            src={project.cover_public_id}
            alt={`${project.title} — cover`}
            fill
            priority
            sizes="100vw"
          />
        </div>
      )}

      <div className="mx-auto max-w-content px-5 sm:px-8">
        {/* header */}
        <header className="relative z-10 mx-auto -mt-14 max-w-3xl rounded-xl border border-line bg-surface p-7 shadow-lift sm:p-10">
          <div className="flex flex-wrap items-center gap-3 text-xs text-faint">
            <Link
              href={`/works?stream=${project.stream}`}
              className="font-medium uppercase tracking-wider text-pen hover:underline"
            >
              {STREAMS[project.stream].name}
            </Link>
            {project.year && (
              <>
                <span aria-hidden>·</span>
                <span>{project.year}</span>
              </>
            )}
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {project.title}
          </h1>
          {project.subtitle && <p className="mt-2 text-lg text-soft">{project.subtitle}</p>}

          <dl className="mt-6 grid gap-x-8 gap-y-4 border-t border-dashed border-line pt-6 text-sm sm:grid-cols-3">
            {meta.role && (
              <div>
                <dt className="font-hand text-lg text-faint">my role</dt>
                <dd className="mt-0.5">{meta.role}</dd>
              </div>
            )}
            {meta.tools && meta.tools.length > 0 && (
              <div>
                <dt className="font-hand text-lg text-faint">tools</dt>
                <dd className="mt-0.5">{meta.tools.join(", ")}</dd>
              </div>
            )}
            {meta.client && (
              <div>
                <dt className="font-hand text-lg text-faint">for</dt>
                <dd className="mt-0.5">{meta.client}</dd>
              </div>
            )}
          </dl>

          {(project.tags?.length || meta.links?.length) && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
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
        <div className="mx-auto mt-14 max-w-3xl">
          <BlockRenderer blocks={project.blocks ?? []} />
        </div>

        <footer className="mx-auto mt-20 max-w-3xl border-t border-dashed border-line pt-8">
          <Link href="/works" className="text-sm font-medium text-pen underline-offset-4 hover:underline">
            ← Back to the archive
          </Link>
        </footer>
      </div>
    </article>
  );
}
