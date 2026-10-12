import Link from "next/link";
import { ArrowLink } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { publicVoiceNote } from "@/lib/voice-note";
import type { JournalPost } from "@/lib/types";

/** A reading pause on Home; the Journal archive keeps its own card explorer. */
export function HomeJournal({ posts }: { posts: JournalPost[] }) {
  const [lead, ...rest] = posts;
  if (!lead) return null;
  const voice = publicVoiceNote(lead.voice_note);
  return <div className="max-w-3xl">
    <article className="border-l-2 border-hl pl-5 sm:pl-8">
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-soft">
        {lead.published_at && <time dateTime={lead.published_at}>{formatDate(lead.published_at)}</time>}
        <span>{lead.reading_minutes} min read</span>
        {voice && <span>Voice note included</span>}
      </p>
      <h3 className="mt-4 break-words font-display text-2xl font-semibold leading-tight sm:text-3xl"><Link href={`/journal/${lead.slug}`} className="hover:text-pen">{lead.title}</Link></h3>
      {lead.excerpt && <p className="mt-4 text-base leading-relaxed text-soft sm:text-lg">{lead.excerpt}</p>}
      <ArrowLink href={`/journal/${lead.slug}`} className="mt-4 min-h-[44px]">Read this note</ArrowLink>
    </article>
    {rest.length > 0 && <ul className="mt-7 border-t border-line">{rest.map((post) => <li key={post.id} className="border-b border-line"><Link href={`/journal/${post.slug}`} className="flex min-h-[44px] items-center justify-between gap-4 py-4 text-lg hover:text-pen"><span>{post.title}</span><span aria-hidden>↗</span></Link></li>)}</ul>}
  </div>;
}
