"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCommandIndex, type CommandIndex } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * ⌘K command palette — the fast path through the studio.
 * Jump to any project/journal/page by name, or fire quick actions,
 * without touching the mouse (desktop) or hunting menus (mobile).
 * Open with Cmd/Ctrl+K or the `hilman:cmdk` event (Search tab / button).
 */

interface PaletteItem {
  key: string;
  label: string;
  group: string;
  href: string;
  hint?: string;
  status?: string;
}

const STATIC_ITEMS: PaletteItem[] = [
  { key: "new-project", label: "New project", group: "Create", href: "/admin/projects/new", hint: "draft a case study" },
  { key: "new-journal", label: "New journal entry", group: "Create", href: "/admin/journal/new", hint: "write a note" },
  { key: "go-dashboard", label: "Dashboard", group: "Go to", href: "/admin" },
  { key: "go-projects", label: "Projects", group: "Go to", href: "/admin/projects" },
  { key: "go-journal", label: "Journal", group: "Go to", href: "/admin/journal" },
  { key: "go-pages", label: "Pages", group: "Go to", href: "/admin/pages" },
  { key: "go-media", label: "Media library", group: "Go to", href: "/admin/media" },
  { key: "go-taxonomy", label: "Taxonomy", group: "Go to", href: "/admin/taxonomy" },
  { key: "go-messages", label: "Messages", group: "Go to", href: "/admin/messages" },
  { key: "go-settings", label: "Settings", group: "Go to", href: "/admin/settings" },
  { key: "view-site", label: "View live site ↗", group: "Go to", href: "/" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<CommandIndex | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // open/close triggers
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("hilman:cmdk", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("hilman:cmdk", onOpenEvent);
    };
  }, []);

  // lazy-load the content index the first time the palette opens
  useEffect(() => {
    if (open && !index) {
      getCommandIndex().then(setIndex).catch(() => {});
    }
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open, index]);

  const items = useMemo<PaletteItem[]>(() => {
    const content: PaletteItem[] = [
      ...(index?.projects ?? []).map((p) => ({
        key: `p-${p.id}`,
        label: p.title,
        group: "Projects",
        href: `/admin/projects/${p.id}`,
        status: p.status,
      })),
      ...(index?.journal ?? []).map((j) => ({
        key: `j-${j.id}`,
        label: j.title,
        group: "Journal",
        href: `/admin/journal/${j.id}`,
        status: j.status,
      })),
      ...(index?.pages ?? []).map((pg) => ({
        key: `pg-${pg.id}`,
        label: pg.title,
        group: "Pages",
        href: `/admin/pages/${pg.slug}`,
      })),
    ];
    const all = [...STATIC_ITEMS, ...content];
    const q = query.trim().toLowerCase();
    if (!q) {
      // default view: create actions + a few recent items + sections
      return [
        ...STATIC_ITEMS.slice(0, 2),
        ...content.slice(0, 5),
        ...STATIC_ITEMS.slice(2),
      ];
    }
    return all.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 12);
  }, [index, query]);

  const go = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      if (item.key === "view-site") {
        window.open("/", "_blank");
        return;
      }
      router.push(item.href);
    },
    [router]
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  }

  // keep the active row visible
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm sm:pt-[18vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-line-strong bg-surface shadow-lift">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--pen)" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Jump to anything… (projects, journal, pages, actions)"
            className="min-h-[52px] w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
            aria-label="Search the studio"
          />
          <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-2xs text-faint sm:block">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-faint">Nothing matches “{query}”.</p>
          )}
          {items.map((item, i) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.key}>
                {showGroup && (
                  <p className="px-3 pb-1 pt-2.5 font-mono text-2xs font-semibold uppercase tracking-widest text-faint">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  data-idx={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(item)}
                  className={cn(
                    "flex min-h-[44px] w-full items-center justify-between gap-3 rounded px-3 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-hl text-hl-ink" : "text-ink hover:bg-card-hover"
                  )}
                >
                  <span className="truncate font-medium">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {item.status && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase",
                          i === active
                            ? "bg-black/15 text-hl-ink"
                            : item.status === "published"
                              ? "bg-pen-soft text-pen"
                              : "bg-n-200 text-soft"
                        )}
                      >
                        {item.status}
                      </span>
                    )}
                    {item.hint && (
                      <span className={cn("text-2xs", i === active ? "text-hl-ink/70" : "text-faint")}>
                        {item.hint}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="hidden items-center gap-4 border-t border-line px-4 py-2 font-mono text-2xs text-faint sm:flex">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⌘K toggle</span>
        </div>
      </div>
    </div>
  );
}
