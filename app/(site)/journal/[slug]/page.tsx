import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "@/components/blocks/renderer";
import { JournalCard } from "@/components/journal-card";
import { PrevNext } from "@/components/prev-next";
import { ArrowLink, EntryMeta, Tag } from "@/components/ui";
import { getJournalBySlug, getJournalPosts, getRelatedJournal, load } from "@/lib/data";
import { ContentUnavailablePage } from "@/components/content-unavailable";
import { mediaSrc } from "@/lib/cloudinary";
import { DEFAULT_SHARE_IMAGE, SITE_NAME } from "@/lib/site";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

/** Rendered ahead of time and kept with ISR — see app/(site)/works/[slug]/page.tsx. */
export async function generateStaticParams() {
  const res = await load(getJournalPosts);
  return res.ok ? res.value.map((post) => ({ slug: post.slug })) : [];
}

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
  const res = await load(() => getJournalBySlug(params.slug));
  const post = res.ok ? res.value : null;
  if (!post) return {};
  const og = mediaSrc(post.cover_public_id, { width: 1200 });
  const description = post.excerpt ?? undefined;
  const path = `/journal/${post.slug}`;
  return {
    title: post.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      siteName: SITE_NAME,
      url: path,
      title: post.title,
      description,
      publishedTime: post.published_at ?? undefined,
      images: og ? [{ url: og, alt: post.title }] : [DEFAULT_SHARE_IMAGE],
    },
  };
}

export default async function JournalEntryPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  // A failed read is not a missing entry — see the works detail page.
  const postRes = await load(() => getJournalBySlug(params.slug));
  if (!postRes.ok) {
    return <ContentUnavailablePage what="this entry" detail={postRes.error} />;
  }
  const post = postRes.value;
  if (!post) notFound();

  const [relatedRes, allRes] = await Promise.all([
    load(() => getRelatedJournal(post)),
    load(getJournalPosts),
  ]);
  const related = relatedRes.ok ? relatedRes.value : [];
  const all = allRes.ok ? allRes.value : [];

  const idx = all.findIndex((p) => p.slug === post.slug);
  const newer = idx > 0 ? all[idx - 1] : null;
  const older = idx >= 0 && idx < all.length - 1 ? all[idx + 1] : null;
  const toItem = (p: typeof newer) => (p ? { href: `/journal/${p.slug}`, title: p.title } : null);

  return (
    <article
      /* The one attribute that makes a journal entry read differently from a
         case study: it narrows how far media may step out of the reading
         column — see --media-lg in app/globals.css — without any block inside
         knowing which page it landed on. */
      data-reading="intimate"
      className="w-full py-14"
    >
      <header className="mx-auto max-w-3xl px-5 sm:px-8">
        <EntryMeta items={[formatDate(post.published_at), `${post.reading_minutes} min read`]} />
        <h1 className="mt-4 font-display text-[clamp(2rem,7.2vw,3.815rem)] font-bold leading-[1.14] tracking-tight sm:leading-[1.06]">
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
        <hr className="mt-8 border-t-2 border-ink" />
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
