import Link from "next/link";
import { Stamp, Tag } from "./ui";
import type { JournalPost } from "@/lib/types";

function dateParts(iso: string | null | undefined) {
  if (!iso) return { day: "··", month: "———", year: "" };
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, "0"),
    month: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    year: String(d.getFullYear()),
  };
}

export function JournalCard({ post }: { post: JournalPost }) {
  const { day, month, year } = dateParts(post.published_at);
  return (
    <Link
      href={`/journal/${post.slug}`}
      className="group grid grid-cols-[auto_1fr] gap-5 rounded-md border border-line bg-surface p-5 shadow-card transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift sm:gap-6 sm:p-6"
    >
      {/* diary date-rail */}
      <div className="flex flex-col items-center border-r border-dashed border-line-strong pr-5 text-center sm:pr-6">
        <span className="font-display text-2xl font-bold leading-none tnum">{day}</span>
        <span className="mt-1 font-mono text-2xs tracking-widest text-faint">{month}</span>
        <span className="font-mono text-2xs text-faint tnum">{year}</span>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-faint">
          <span>{post.reading_minutes} min read</span>
          {post.featured && (
            <span className="ml-auto">
              <Stamp tone="hl">pinned</Stamp>
            </span>
          )}
        </div>
        <h3 className="mt-1.5 font-display text-xl font-semibold leading-snug tracking-tight transition-colors duration-fast group-hover:text-pen">
          {post.title}
        </h3>
        {post.excerpt && <p className="mt-2 text-sm leading-relaxed text-soft">{post.excerpt}</p>}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {post.tags.map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
