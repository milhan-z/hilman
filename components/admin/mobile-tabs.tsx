"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Mobile bottom tab bar — the studio's thumb-reachable navigation
 * (the WordPress/Notion mobile-app pattern). Hidden on editor pages,
 * where the sticky save bar owns the bottom edge.
 */

const EDITOR_ROUTE = /^\/admin\/(projects|journal)\/[^/]+$|^\/admin\/pages\/[^/]+$/;

const TABS = [
  {
    label: "Home",
    href: "/admin",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
      </svg>
    ),
  },
  {
    label: "Projects",
    href: "/admin/projects",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "Journal",
    href: "/admin/journal",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
  },
] as const;

/** The things worth starting from anywhere in the studio, in one tap. */
const CREATE_LINKS = [
  { label: "New project", href: "/admin/projects/new", hint: "a case study" },
  { label: "New journal entry", href: "/admin/journal/new", hint: "a note" },
  { label: "Upload media", href: "/admin/media", hint: "images & files" },
];

const MORE_LINKS = [
  { label: "Pages", href: "/admin/pages" },
  { label: "Media library", href: "/admin/media" },
  { label: "Taxonomy", href: "/admin/taxonomy" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Settings", href: "/admin/settings" },
];

/** Bottom sheet chrome — the overlay, the grab handle, the dismiss behaviour. */
function Sheet({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm lg:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line-strong bg-surface p-4 pb-[calc(76px+env(safe-area-inset-bottom))] shadow-lift">
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
        {children}
      </div>
    </div>
  );
}

export function MobileTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
    setCreateOpen(false);
  }, [pathname]);

  if (EDITOR_ROUTE.test(pathname)) return null;

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const tabCls = (active: boolean) =>
    cn(
      "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md font-mono text-2xs uppercase tracking-wide transition-colors",
      active ? "text-pen" : "text-faint hover:text-soft"
    );

  return (
    <>
      {/* in-flow spacer so page content can scroll clear of the fixed bar */}
      <div aria-hidden className="h-[calc(64px+env(safe-area-inset-bottom))] lg:hidden" />

      {/* Create sheet — the studio's primary action on a phone */}
      {createOpen && (
        <Sheet label="Create something new" onClose={() => setCreateOpen(false)}>
          <p className="mb-3 px-1 font-mono text-2xs uppercase tracking-widest text-faint">
            Add to the archive
          </p>
          <div className="grid gap-2">
            {CREATE_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-md border border-line bg-raise px-4 transition-colors hover:border-pen"
              >
                <span className="text-base font-semibold text-ink">{l.label}</span>
                <span className="font-mono text-2xs uppercase tracking-wide text-faint">
                  {l.hint}
                </span>
              </Link>
            ))}
          </div>
        </Sheet>
      )}

      {/* More sheet */}
      {moreOpen && (
        <Sheet label="More sections" onClose={() => setMoreOpen(false)}>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                window.dispatchEvent(new Event("hilman:cmdk"));
              }}
              className="col-span-2 flex min-h-[48px] items-center gap-2.5 rounded-md border border-line bg-raise px-4 text-sm font-medium text-soft"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              Search the studio
            </button>
              {MORE_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex min-h-[48px] items-center rounded-md border px-4 text-sm font-medium transition-colors",
                    isActive(l.href)
                      ? "border-hl bg-hl-soft text-ink"
                      : "border-line bg-raise text-soft hover:text-ink"
                  )}
                >
                  {l.label}
                </Link>
              ))}
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] items-center rounded-md border border-line bg-raise px-4 text-sm font-medium text-pen"
              >
                View site ↗
              </a>
            <form action={signOut} className="contents">
              <button className="flex min-h-[48px] items-center rounded-md border border-line bg-raise px-4 text-left text-sm font-medium text-red">
                Sign out
              </button>
            </form>
          </div>
        </Sheet>
      )}

      {/* Tab bar */}
      <nav
        aria-label="Studio quick navigation"
        className="fixed inset-x-0 bottom-0 z-[80] border-t border-line-strong bg-paper/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-1">
          {TABS.slice(0, 2).map((t) => (
            <Link key={t.href} href={t.href} className={tabCls(isActive(t.href))} aria-current={isActive(t.href) ? "page" : undefined}>
              {t.icon}
              {t.label}
            </Link>
          ))}

          {/* Create sits dead centre, under the thumb, and is the only filled
              control on the bar — starting something new is the studio's whole
              point on a phone, and it used to be three taps deep. */}
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            aria-expanded={createOpen}
            aria-label="Create something new"
            className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 font-mono text-2xs uppercase tracking-wide text-hl-ink"
          >
            <span className="flex h-8 w-12 items-center justify-center rounded-full bg-hl shadow-card transition-transform active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
            <span className="text-hl">New</span>
          </button>

          {TABS.slice(2).map((t) => (
            <Link key={t.href} href={t.href} className={tabCls(isActive(t.href))} aria-current={isActive(t.href) ? "page" : undefined}>
              {t.icon}
              {t.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className={tabCls(moreOpen || MORE_LINKS.some((l) => isActive(l.href)))}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
            More
          </button>
        </div>
      </nav>
    </>
  );
}
