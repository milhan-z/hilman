import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/renderer";
import { JournalCard } from "@/components/journal-card";
import { Tag } from "@/components/ui";
import { getJournalBySlug, getRelatedJournal } from "@/lib/data";
import { mediaSrc } from "@/lib/cloudinary";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getJournalBySlug(params.slug);
  if (!post) return {};
  const og = mediaSrc(post.cover_public_id, { width: 1200 });
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: og ? { images: [{ url: og }] } : undefined,
  };
}

export default async function JournalEntryPage({ params }: { params: { slug: string } }) {
  const post = await getJournalBySlug(params.slug);
  if (!post) notFound();
  const related = await getRelatedJournal(post);

  return (
    <article className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <header>
        <div className="flex flex-wrap items-center gap-3 text-sm text-faint">
          <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
          <span aria-hidden>·</span>
          <span>{post.reading_minutes} min read</span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {post.title}
        </h1>
        {post.excerpt && <p className="mt-4 text-lg italic text-soft">{post.excerpt}</p>}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
        <hr className="mt-8 border-t border-dashed border-line-strong" />
      </header>

      <div className="mt-10">
        <BlockRenderer blocks={post.blocks ?? []} />
      </div>

      {related.length > 0 && (
        <aside className="mt-20 border-t border-dashed border-line pt-10" aria-label="Related entries">
          <p className="mb-5 font-hand text-xl text-faint">grows in the same corner —</p>
          <div className="space-y-5">
            {related.map((r) => (
              <JournalCard key={r.id} post={r} />
            ))}
          </div>
        </aside>
      )}

      <footer className="mt-16">
        <Link href="/journal" className="text-sm font-medium text-pen underline-offset-4 hover:underline">
          ← Back to the garden
        </Link>
      </footer>
    </article>
  );
}
