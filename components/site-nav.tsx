"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

export function SiteNav({ items }: { items: { label: string; href: string }[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setOpen(false), [pathname]);
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  return <header className="sticky top-0 z-40 border-b border-line bg-paper backdrop-blur-md" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { setOpen(false); toggleRef.current?.focus(); }
  }}>
    <nav aria-label="Main" className="mx-auto flex h-20 max-w-wide items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
      <Link href="/" className="group flex items-center gap-4" aria-label="Hilman — home">
        <span className="font-display text-2xl font-bold tracking-tight transition-colors group-hover:text-pen">Hilman<span className="text-pen">.</span></span>
        <span className="hidden border-l border-line-strong pl-4 font-hand text-lg text-soft xl:block">a personal notebook</span>
      </Link>
      <div className="hidden items-center gap-1 md:flex">
        {items.map((item) => <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded px-3 text-sm font-medium transition-colors", isActive(item.href) ? "text-pen underline decoration-pen underline-offset-8" : "text-soft hover:text-ink")}>{item.label}</Link>)}
      </div>
      <div className="flex items-center gap-1 md:border-l md:border-line md:pl-2">
        <ThemeToggle />
        <button ref={toggleRef} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="mobile-nav" aria-label={open ? "Close menu" : "Open menu"} className="flex h-11 w-11 items-center justify-center rounded text-ink hover:bg-raise md:hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>{open ? <path d="m6 6 12 12M18 6 6 18" /> : <path d="M4 8h16M4 16h16" />}</svg>
        </button>
      </div>
    </nav>
    <div id="mobile-nav" hidden={!open} className="border-t border-line bg-surface px-5 py-3 md:!hidden">
      <nav aria-label="Mobile">{items.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} aria-current={isActive(item.href) ? "page" : undefined} className={cn("flex min-h-12 items-center justify-between border-b border-line py-3 last:border-b-0", isActive(item.href) ? "text-pen" : "text-ink")}>{item.label}<span aria-hidden className="text-soft">↗</span></Link>)}</nav>
    </div>
  </header>;
}
