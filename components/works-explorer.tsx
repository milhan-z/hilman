"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { ProjectCard } from "./project-card";
import { EntryMeta } from "./ui";
import { STREAMS, type Project, type Stream, type TagRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const STREAM_ACCENT: Record<Stream, string> = {
  "visual-design": "var(--pen)",
  "visual-stories": "var(--red)",
  "digital-lab": "var(--cyan)",
};

const streamKeys = Object.keys(STREAMS) as Stream[];
const EASE = [0.16, 1, 0.3, 1] as const;

type SortKey = "curated" | "newest" | "oldest" | "az";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "curated", label: "Curated" },
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "az", label: "A–Z" },
];

/**
 * Client-side Works explorer — search + stream + tag + sort all filter the
 * in-memory list instantly (no navigation, no loading) and animate the grid
 * with shared-layout transitions. Built to stay usable as the archive grows.
 */
export function WorksExplorer({
  projects,
  tags,
  initialStream,
  initialTag,
}: {
  projects: Project[];
  tags: TagRow[];
  initialStream?: Stream;
  initialTag?: string;
}) {
  const reduced = useReducedMotion();
  const [stream, setStream] = useState<Stream | undefined>(initialStream);
  const [tag, setTag] = useState<string | undefined>(initialTag);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("curated");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (stream && p.stream !== stream) return false;
      if (tag && !(p.tags ?? []).some((t) => t.slug === tag)) return false;
      if (q) {
        const hay = [p.title, p.subtitle, p.excerpt, ...(p.tags ?? []).map((t) => t.name)]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const time = (p: Project) => (p.published_at ? Date.parse(p.published_at) : (p.year ?? 0) * 1e10);
    list.sort((a, b) => {
      if (sort === "newest") return time(b) - time(a);
      if (sort === "oldest") return time(a) - time(b);
      if (sort === "az") return a.title.localeCompare(b.title);
      return a.sort_order - b.sort_order;
    });
    return list;
  }, [projects, stream, tag, query, sort]);

  function syncUrl(nextStream?: Stream, nextTag?: string) {
    const params = new URLSearchParams();
    if (nextStream) params.set("stream", nextStream);
    if (nextTag) params.set("tag", nextTag);
    const q = params.toString();
    window.history.replaceState(null, "", q ? `/works?${q}` : "/works");
  }
  const pickStream = (next?: Stream) => {
    setStream(next);
    syncUrl(next, tag);
  };
  const pickTag = (next?: string) => {
    setTag(next);
    syncUrl(stream, next);
  };
  const reset = () => {
    setStream(undefined);
    setTag(undefined);
    setQuery("");
    syncUrl(undefined, undefined);
  };

  const anyFilter = stream || tag || query.trim();

  return (
    <div>
      {/* search + sort */}
      <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search works</span>
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
            placeholder="Search titles, tags, descriptions…"
            className="w-full rounded-md border border-line-strong bg-surface py-2.5 pl-10 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-pen focus:ring-1 focus:ring-pen"
          />
        </label>
        <div className="flex items-center gap-2 font-mono text-2xs uppercase tracking-wider text-faint">
          <span>sort</span>
          <div className="flex rounded-md border border-line-strong p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                aria-pressed={sort === s.key}
                className={cn(
                  "rounded px-2.5 py-1 transition-colors",
                  sort === s.key ? "bg-hl text-hl-ink font-semibold" : "text-soft hover:text-ink"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* filing tabs */}
      <nav aria-label="Work streams" className="mt-6 flex flex-wrap items-end gap-1 border-b-2 border-line-strong">
        {[undefined, ...streamKeys].map((s) => {
          const active = stream === s;
          return (
            <button
              key={s ?? "all"}
              type="button"
              onClick={() => pickStream(s)}
              aria-pressed={active}
              className={cn(
                "relative min-h-[44px] translate-y-[2px] rounded-t-md border border-b-0 px-4 py-2.5 font-mono text-2xs uppercase tracking-widest transition-colors duration-fast",
                active ? "border-line-strong bg-surface font-bold text-ink" : "border-transparent text-faint hover:text-ink"
              )}
              style={active && s ? { boxShadow: `inset 0 3px 0 ${STREAM_ACCENT[s]}` } : undefined}
            >
              {s ? STREAMS[s].name : "Everything"}
            </button>
          );
        })}
      </nav>

      {/* tag chips */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="font-hand text-lg text-faint">filter:</span>
        {tags.map((t) => {
          const active = tag === t.slug;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => pickTag(active ? undefined : t.slug)}
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
          <button type="button" onClick={reset} className="ml-1 font-mono text-2xs uppercase tracking-wider text-red hover:underline">
            clear ✕
          </button>
        )}
      </div>

      <EntryMeta
        className="mt-6"
        items={[
          `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`,
          stream ? STREAMS[stream].name : "all streams",
          tag ? `#${tag}` : null,
          query.trim() ? `“${query.trim()}”` : null,
        ]}
      />

      {/* animated grid */}
      <div className="mt-6">
        {filtered.length === 0 ? (
          <div className="dotgrid rounded-lg border border-dashed border-line-strong p-12 text-center">
            <p className="font-display text-lg text-soft">Nothing matches that yet.</p>
            <button onClick={reset} className="mt-2 font-hand text-lg text-pen hover:underline">
              clear the filters
            </button>
          </div>
        ) : (
          <LayoutGroup>
            <motion.div layout={!reduced} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              <AnimatePresence mode="popLayout">
                {filtered.map((p, i) => (
                  <motion.div
                    key={p.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, scale: 0.96, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    <ProjectCard project={p} index={i} priority={i < 3} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          </LayoutGroup>
        )}
      </div>
    </div>
  );
}
