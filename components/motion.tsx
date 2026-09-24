import type { ReactNode } from "react";

/**
 * A section wrapper that used to fade in on scroll.
 *
 * It had been set to `initial={false}` — deliberately, so a page's content is
 * readable before any JavaScript runs — which left a Framer Motion element
 * that never animated and still pulled the library into the page. It is a
 * plain element now, kept so the pages that group their sections with it
 * read the same.
 *
 * The rest of this file went with it: PageFade was the same kind of wrapper
 * around every route (app/(site)/template.tsx, now deleted), and Stagger /
 * StaggerItem had no callers.
 */
export function SectionReveal({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}
