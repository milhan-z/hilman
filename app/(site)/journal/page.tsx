import type { Metadata } from "next";
import { JournalCard } from "@/components/journal-card";
import { EmptyState } from "@/components/ui";
import { getJournalPosts } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Journal",
  description: "Hilman's digital garden — notes on design, media, code, and the space between.",
};

export default async function JournalPage() {
  const posts = await getJournalPosts();
  const pinned = posts.filter((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8">
      <header>
        <p className="font-hand text-xl text-faint">a garden, not a feed</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Journal</h1>
        <p className="mt-4 text-lg text-soft">
          Notes that grow slowly. Some are finished thoughts, most are thoughts in progress —
          dated so old me is allowed to be wrong.
        </p>
      </header>

      <div className="mt-12 space-y-6">
        {posts.length === 0 && (
          <EmptyState title="The garden is freshly tilled." hint="entries coming soon" />
        )}
        {pinned.map((post) => (
          <JournalCard key={post.id} post={post} />
        ))}
        {rest.map((post) => (
          <JournalCard key={post.id} post={post} />
        ))}
      </div>
    </div>
  );
}
