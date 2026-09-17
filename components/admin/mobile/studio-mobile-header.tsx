"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyncIndicator } from "../sync-indicator";
import { ThemeToggle } from "../../theme-toggle";
import { EDITOR_ROUTE } from "./routes";

/**
 * The studio's name and the state of your work, always on screen.
 *
 * It used to be an ordinary block at the top of the page, so on a long list it
 * scrolled away and took the sync indicator with it — the one piece of
 * information you might want to glance at *while* scrolling, because it
 * answers "is what I wrote actually safe yet".
 *
 * Sticky rather than fixed: it participates in the document's own scroll, so
 * there is no spacer to keep in step with it and nothing to go wrong when the
 * address bar changes the viewport height mid-gesture. The bottom tab bar is
 * fixed for the opposite reason — it is chrome, not part of the page.
 *
 * Hidden inside an editor. That screen has its own header carrying a back
 * button, the title, the ••• menu and the save status, and two stacked bars
 * would cost a tenth of an iPhone's height to say the word "studio".
 */
export function StudioMobileHeader() {
  const pathname = usePathname();
  if (EDITOR_ROUTE.test(pathname)) return null;

  return (
    <header
      className={[
        // z-70: under the bottom tabs (80) and well under the sheets (100),
        // which is the order you would want if they ever overlapped.
        "sticky top-0 z-[70] border-b border-line lg:hidden",
        "bg-surface/95 supports-[backdrop-filter]:backdrop-blur",
        "pt-[env(safe-area-inset-top)]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-2 py-2">
        <Link href="/admin" className="shrink-0 font-display text-lg font-bold">
          Hilman<span className="text-pen">.</span>{" "}
          <span className="font-hand text-lg text-faint">studio</span>
        </Link>
        <div className="flex items-center gap-1.5">
          {/* Where your work actually is — queued, syncing, or on the site. */}
          <SyncIndicator />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
