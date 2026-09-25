import type { Metadata } from "next";
import { HandDrawnReveal } from "@/components/bits/hand-drawn-reveal";
import { JournalExplorer } from "@/components/journal-explorer";
import { ArrowLink, Kicker } from "@/components/ui";
import { getJournalPosts, load } from "@/lib/data";
import { ContentUnavailable } from "@/components/content-unavailable";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Journal",
  description: "Hilman's digital garden — notes on design, media, code, and the space between.",
};

export default async function JournalPage() {
  const postsRes = await load(getJournalPosts);
  const posts = postsRes.ok ? postsRes.value : [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
      <header>
        <Kicker>things I want to remember</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold leading-none tracking-tight sm:text-5xl">Journal</h1>
          <div className="absolute -bottom-2 left-0">
            <HandDrawnReveal variant="scribble" width={155} strokeWidth={3.5} />
          </div>
        </div>
        <p className="mt-5 text-lg text-pretty leading-relaxed text-soft">
          Moments with people, creative detours, and things I’m learning.
          A little space to think out loud and keep the stories behind the work.
        </p>
      </header>

      {!postsRes.ok ? (
        <div className="mt-12">
          <ContentUnavailable what="the journal" detail={postsRes.error} />
        </div>
      ) : posts.length === 0 ? (
        <div className="ruled mt-12 rounded-lg border border-line bg-surface p-7 sm:p-10">
          <p className="font-display text-2xl font-medium">The first pages are taking shape.</p>
          <p className="mt-4 text-soft">I’m gathering the stories I’d like to share here. For now, there’s a little more about my interests and the people side of my life on the About page.</p>
          <ArrowLink href="/about#people" className="mt-6">Get to know me</ArrowLink>
        </div>
      ) : (
        <JournalExplorer posts={posts} />
      )}
    </div>
  );
}
