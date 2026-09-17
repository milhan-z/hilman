"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { QuickCreateSheet } from "./mobile/quick-create-sheet";
import {
  PRIMARY_DESTINATIONS,
  SECONDARY_DESTINATIONS,
  isDestinationActive,
  type StudioIcon,
} from "@/lib/studio-nav";
import { cn } from "@/lib/utils";

/**
 * The studio's navigation, as a desktop rail.
 *
 * This is the same navigation as the phone's bottom tab bar, not a second one.
 * Both read lib/studio-nav.ts, so the destinations, their names and their
 * order are decided in one place; what differs here is only the shape a wide
 * screen can afford — a vertical rail with room for labels, and the secondary
 * destinations listed under a rule instead of behind a "More" sheet.
 *
 * Three things changed when the two lists were merged, all of them cases where
 * the desktop had quietly drifted into being a different product:
 *
 *   `/admin` was called "Dashboard" here and "Home" on the phone. It is Home.
 *   It is the same screen, and the word "Dashboard" is a promise about stat
 *   cards that the screen stopped making some time ago.
 *
 *   There was no way to create anything from this rail. The ✛ in the middle of
 *   the tab bar is the studio's create affordance, and Quick note only existed
 *   behind it — so on a laptop that flow was reachable from exactly one screen.
 *   The rail now opens the same sheet.
 *
 *   "Media"/"Media library" and "Taxonomy"/"Tags & categories" were two names
 *   for two screens each. One name now.
 */

const icons: Record<StudioIcon, React.ReactNode> = {
  home: <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />,
  projects: (
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  ),
  journal: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </>
  ),
  pages: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </>
  ),
  media: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  taxonomy: (
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </>
  ),
  messages: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

function Icon({ name }: { name: StudioIcon }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {icons[name]}
    </svg>
  );
}

const rowClass = (active: boolean) =>
  cn(
    "flex min-h-11 items-center gap-3 whitespace-nowrap rounded px-3 text-sm font-medium",
    "transition-colors",
    active ? "bg-hl font-semibold text-hl-ink" : "text-soft hover:bg-card-hover hover:text-ink"
  );

export function AdminNav() {
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <nav aria-label="Studio" className="flex flex-col gap-1 px-3 pb-5">
        {/* ⌘K — the fast path. The tab bar offers the same thing inside More. */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("hilman:cmdk"))}
          className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded border border-line-strong px-3 text-sm text-faint transition-colors hover:border-pen hover:text-pen"
        >
          <span className="flex items-center gap-2.5">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            Search…
          </span>
          <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-2xs">⌘K</kbd>
        </button>

        {PRIMARY_DESTINATIONS.map((destination) => {
          const active = isDestinationActive(destination.href, pathname);
          return (
            <Link key={destination.href} href={destination.href} className={rowClass(active)}>
              <span className={cn("shrink-0", active ? "text-hl-ink" : "text-faint")}>
                <Icon name={destination.icon} />
              </span>
              <span>{destination.label}</span>
            </Link>
          );
        })}

        {/* The rail's ✛. Same sheet, same four choices, same results as the
            one in the middle of the phone's tab bar. */}
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-1 flex min-h-11 items-center gap-3 rounded border border-dashed border-line-strong px-3 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
        >
          <span aria-hidden className="flex w-[18px] shrink-0 justify-center text-base leading-none">
            ＋
          </span>
          <span>Create</span>
        </button>

        <hr className="my-3 border-line" />

        {SECONDARY_DESTINATIONS.map((destination) => {
          const active = isDestinationActive(destination.href, pathname);
          return (
            <Link key={destination.href} href={destination.href} className={rowClass(active)}>
              <span className={cn("shrink-0", active ? "text-hl-ink" : "text-faint")}>
                <Icon name={destination.icon} />
              </span>
              <span>{destination.label}</span>
            </Link>
          );
        })}
      </nav>

      <QuickCreateSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
