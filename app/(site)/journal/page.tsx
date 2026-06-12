import type { Metadata } from "next";
import { DrawAccent } from "@/components/draw-accent";
import { JournalExplorer } from "@/components/journal-explorer";
import { EmptyState, Kicker } from "@/components/ui";
import { getJournalPosts } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Journal",
  description: "Hilman's digital garden — notes on design, media, code, and the space between.",
};

export default async function JournalPage() {
  const posts = await getJournalPosts();

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <header>
        <Kicker>a garden, not a feed</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">Journal</h1>
          <div className="absolute -bottom-2 left-0">
            <DrawAccent variant="scribble" color="yellow" width={155} strokeWidth={3.5} />
          </div>
        </div>
        <p className="mt-5 text-lg text-pretty leading-relaxed text-soft">
          Notes that grow slowly. Some are finished thoughts, most are thoughts in progress — dated so
          old me is allowed to be wrong. Search or filter by topic to dig in.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="mt-12">
          <EmptyState title="The garden is freshly tilled." hint="entries coming soon" />
        </div>
      ) : (
        <JournalExplorer posts={posts} />
      )}
    </div>
  );
}
