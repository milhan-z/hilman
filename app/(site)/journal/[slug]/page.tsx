import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/renderer";
import { JournalCard } from "@/components/journal-card";
import { PrevNext } from "@/components/prev-next";
import { ArrowLink, EntryMeta, Tag } from "@/components/ui";
import { getJournalBySlug, getJournalPosts, getRelatedJournal } from "@/lib/data";
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
  const [related, all] = await Promise.all([getRelatedJournal(post), getJournalPosts()]);

  const idx = all.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const toItem = (p: typeof newer) => (p ? { href: `/journal/${p.slug}`, title: p.title } : null);

  return (
    <article className="w-full py-14">
      <header className="mx-auto max-w-3xl px-5 sm:px-8">
        <EntryMeta items={[formatDate(post.published_at), `${post.reading_minutes} min read`]} />
        <h1 className="mt-4 font-display text-4xl font-bold leading-[1.06] tracking-tight sm:text-5xl">
          {post.title}
        </h1>
        {post.excerpt && (
          <p className="mt-5 border-l-2 border-hl pl-4 text-lg italic leading-relaxed text-soft">
            {post.excerpt}
          </p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
        <hr className="mt-8 border-t-2 border-ink/80" />
      </header>

      <div className="mt-12 w-full">
        <BlockRenderer blocks={post.blocks ?? []} />
      </div>

      {related.length > 0 && (
        <aside
          className="mx-auto mt-20 max-w-3xl border-t border-dashed border-line px-5 pt-10 sm:px-8"
          aria-label="Related entries"
        >
          <p className="mb-5 font-hand text-xl text-faint">grows in the same corner —</p>
          <div className="space-y-4">
            {related.map((r) => (
              <JournalCard key={r.id} post={r} />
            ))}
          </div>
        </aside>
      )}

      <footer className="mx-auto mt-16 max-w-3xl px-5 sm:px-8">
        <PrevNext prev={toItem(older)} next={toItem(newer)} label="entry" />
        <div className="mt-8 border-t-2 border-line-strong pt-6">
          <ArrowLink href="/journal" back>
            Back to the garden
          </ArrowLink>
        </div>
      </footer>
    </article>
  );
}
