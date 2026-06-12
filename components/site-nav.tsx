"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

/* Section index — the notebook's table of contents.
   Each route is an entry with a catalog number. */
const SECTION_INDEX: { match: string; num: string; name: string }[] = [
  { match: "/works", num: "01", name: "WORKS" },
  { match: "/journal", num: "02", name: "JOURNAL" },
  { match: "/lab", num: "03", name: "LAB" },
  { match: "/about", num: "04", name: "ABOUT" },
  { match: "/connect", num: "05", name: "CONNECT" },
];

function sectionFor(pathname: string) {
  if (pathname === "/") return { num: "00", name: "INDEX" };
  return SECTION_INDEX.find((s) => pathname.startsWith(s.match)) ?? { num: "—", name: "ARCHIVE" };
}

function navNumber(href: string) {
  return SECTION_INDEX.find((s) => href.startsWith(s.match))?.num ?? "··";
}

export function SiteNav({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const today = new Date();
    const fmt = today
      .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
      .toUpperCase();
    setDateStr(fmt);
  }, []);

  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const section = sectionFor(pathname);

  return (
    <header className="sticky top-0 z-40 border-b-2 border-ink/85 bg-paper/90 backdrop-blur-md">
      {/* ── Ledger strip — the bound header of the page ── */}
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-wide items-center justify-between px-5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:px-8">
          <div className="flex items-center gap-2 tnum">
            <span className="text-faint/70">No.</span>
            <span className="font-semibold text-ink">{section.num}</span>
            <span className="hidden text-line-strong sm:inline">/</span>
            <span className="hidden font-semibold text-ink sm:inline">{section.name}</span>
          </div>
          <div className="hidden font-hand text-sm normal-case tracking-normal text-faint md:block">
            a living notebook of design, media &amp; code
          </div>
          <div className="flex items-center gap-2 tnum">
            <span className="text-faint/70">Date</span>
            <span className="font-semibold text-ink" suppressHydrationWarning>
              {dateStr || "——"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Masthead ── */}
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 max-w-wide items-center justify-between px-5 sm:px-8"
      >
        <Link href="/" className="group flex items-baseline gap-0.5" aria-label="Hilman — home / index">
          <span className="font-display text-2xl font-bold tracking-tight transition-colors group-hover:text-pen">
            Hilman
          </span>
          {/* end-of-entry stamp */}
          <span
            aria-hidden
            className="mb-1 inline-block h-[7px] w-[7px] rounded-[1px] bg-red transition-transform group-hover:rotate-12"
          />
        </Link>

        {/* desktop index */}
        <div className="hidden items-center gap-1 md:flex">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm transition-colors duration-fast",
                  active ? "text-ink" : "text-soft hover:text-ink"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "font-mono text-2xs tnum transition-colors",
                    active ? "text-pen" : "text-faint/70 group-hover:text-faint"
                  )}
                >
                  {navNumber(item.href)}
                </span>
                <span className={cn("font-medium", active && "hl-mark")}>{item.label}</span>
              </Link>
            );
          })}
          <div className="ml-2 border-l border-line pl-1">
            <ThemeToggle />
          </div>
        </div>

        {/* mobile */}
        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close index" : "Open index"}
            className="flex h-11 w-11 items-center justify-center rounded text-ink hover:bg-n-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* mobile index drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-nav"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line bg-surface md:hidden"
          >
            <div className="mx-auto max-w-wide px-3 py-2">
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-[48px] items-center gap-3 border-b border-line px-3 last:border-b-0",
                      active ? "text-ink" : "text-soft"
                    )}
                  >
                    <span aria-hidden className="font-mono text-2xs text-faint tnum">{navNumber(item.href)}</span>
                    <span className={cn("text-base font-medium", active && "hl-mark")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
