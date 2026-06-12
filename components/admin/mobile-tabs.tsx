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

const MORE_LINKS = [
  { label: "Pages", href: "/admin/pages" },
  { label: "Media library", href: "/admin/media" },
  { label: "Taxonomy", href: "/admin/taxonomy" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Settings", href: "/admin/settings" },
];

export function MobileTabs() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (EDITOR_ROUTE.test(pathname)) return null;

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const tabCls = (active: boolean) =>
    cn(
      "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md font-mono text-[10px] uppercase tracking-wide transition-colors",
      active ? "text-pen" : "text-faint hover:text-soft"
    );

  return (
    <>
      {/* in-flow spacer so page content can scroll clear of the fixed bar */}
      <div aria-hidden className="h-[calc(64px+env(safe-area-inset-bottom))] lg:hidden" />

      {/* More sheet */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm lg:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMoreOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="More sections"
        >
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl border-t border-line-strong bg-surface p-4 pb-[calc(76px+env(safe-area-inset-bottom))] shadow-lift">
            <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" />
            <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>
      )}

      {/* Tab bar */}
      <nav
        aria-label="Studio quick navigation"
        className="fixed inset-x-0 bottom-0 z-[80] border-t border-line-strong bg-paper/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch gap-1">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className={tabCls(isActive(t.href))} aria-current={isActive(t.href) ? "page" : undefined}>
              {t.icon}
              {t.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("hilman:cmdk"))}
            className={tabCls(false)}
            aria-label="Search the studio"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            Search
          </button>
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
