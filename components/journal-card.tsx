import Link from "next/link";
import { Tag } from "./ui";
import { formatDate } from "@/lib/utils";
import type { JournalPost } from "@/lib/types";

export function JournalCard({ post }: { post: JournalPost }) {
  return (
    <Link
      href={`/journal/${post.slug}`}
      className="group block rounded-lg border border-line bg-surface p-6 shadow-card transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-lift sm:p-7"
    >
      <div className="flex items-center gap-3 text-xs text-faint">
        <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
        <span aria-hidden>·</span>
        <span>{post.reading_minutes} min read</span>
        {post.featured && (
          <span className="ml-auto rounded-sm bg-hl px-1.5 py-0.5 font-hand text-sm text-hl-ink">
            pinned
          </span>
        )}
      </div>
      <h3 className="mt-2 font-display text-xl font-semibold leading-snug transition-colors duration-fast group-hover:text-pen">
        {post.title}
      </h3>
      {post.excerpt && <p className="mt-2 text-base text-soft">{post.excerpt}</p>}
      {post.tags && post.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.tags.map((t) => (
            <Tag key={t.id}>{t.name}</Tag>
          ))}
        </div>
      )}
    </Link>
  );
}
