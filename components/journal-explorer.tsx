"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { JournalCard } from "./journal-card";
import { EntryMeta, Stamp } from "./ui";
import type { JournalPost, TagRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const EASE = [0.16, 1, 0.3, 1] as const;

function groupByYear(posts: JournalPost[]) {
  const map = new Map<string, JournalPost[]>();
  for (const p of posts) {
    const year = p.published_at ? String(new Date(p.published_at).getFullYear()) : "Undated";
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(p);
  }
  return Array.from(map.entries());
}

/** Live-filtering journal index — search + tag, with the chronological spine intact. */
export function JournalExplorer({ posts }: { posts: JournalPost[] }) {
  const reduced = useReducedMotion();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | undefined>(undefined);

  const tags = useMemo(() => {
    const map = new Map<string, TagRow>();
    posts.forEach((p) => (p.tags ?? []).forEach((t) => map.set(t.slug, t)));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (tag && !(p.tags ?? []).some((t) => t.slug === tag)) return false;
      if (q) {
        const hay = [p.title, p.excerpt, ...(p.tags ?? []).map((t) => t.name)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, query, tag]);

  const anyFilter = !!(query.trim() || tag);
  const pinned = filtered.filter((p) => p.featured);
  const groups = groupByYear(filtered);

  return (
    <div>
      {/* search + tags */}
      <div className="mt-10 flex flex-col gap-4">
        <label className="relative">
          <span className="sr-only">Search the journal</span>
          <svg
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
            width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries, ideas, tags…"
            className="w-full rounded-md border border-line-strong bg-surface py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-pen focus:ring-1 focus:ring-pen"
          />
        </label>
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-hand text-lg text-faint">topics:</span>
            {tags.map((t) => {
              const active = tag === t.slug;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTag(active ? undefined : t.slug)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center rounded-[4px] border px-2 py-0.5 font-mono text-2xs uppercase tracking-wide transition-colors duration-fast",
                    active ? "border-transparent bg-hl text-hl-ink font-semibold" : "border-line-strong text-soft hover:border-pen hover:text-pen"
                  )}
                >
                  {t.name}
                </button>
              );
            })}
            {anyFilter && (
              <button
                type="button"
                onClick={() => {
                  setTag(undefined);
                  setQuery("");
                }}
                className="ml-1 font-mono text-2xs uppercase tracking-wider text-red hover:underline"
              >
                clear ✕
              </button>
            )}
          </div>
        )}
      </div>

      <EntryMeta
        className="mt-6"
        items={[
          `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`,
          tag ? `#${tag}` : null,
          query.trim() ? `“${query.trim()}”` : "updated when an idea lands",
        ]}
      />

      {filtered.length === 0 && (
        <div className="dotgrid mt-8 rounded-lg border border-dashed border-line-strong p-12 text-center">
          <p className="font-display text-lg text-soft">No entries match that.</p>
          <p className="mt-2 font-hand text-lg text-faint">try a broader word, or clear the topic</p>
        </div>
      )}

      {/* pinned — only when browsing unfiltered */}
      {!anyFilter && pinned.length > 0 && (
        <section className="mt-10" aria-label="Pinned entries">
          <div className="mb-4 flex items-center gap-2">
            <Stamp tone="hl">pinned</Stamp>
            <span className="font-mono text-2xs uppercase tracking-widest text-faint">worth starting with</span>
          </div>
          <div className="space-y-4">
            {pinned.map((post) => (
              <JournalCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      )}

      {/* chronological spine */}
      <LayoutGroup>
        {groups.map(([year, items]) => (
          <section key={year} className="mt-12" aria-label={`Entries from ${year}`}>
            <div className="rule-baseline mb-5 flex items-baseline gap-3">
              <h2 className="font-display text-2xl font-bold tracking-tight tnum">{year}</h2>
              <span className="font-mono text-2xs uppercase tracking-widest text-faint">
                {items.length} {items.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <motion.div layout={!reduced} className="space-y-4">
              <AnimatePresence mode="popLayout">
                {items.map((post) => (
                  <motion.div
                    key={post.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    <JournalCard post={post} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </section>
        ))}
      </LayoutGroup>
    </div>
  );
}
