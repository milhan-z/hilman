import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * Frames that put media in a context.
 *
 * A screenshot of a website reads as a website when it has a window around it,
 * and as a rectangle when it does not. That is the whole job of this file: two
 * small wrappers that say "this was on the web" and "this was on a phone",
 * shared by the image block and the loop clip so the two never drift into
 * having slightly different windows.
 *
 * They know nothing about where the media came from — no Cloudinary, no R2, no
 * pending uploads, no publishing. They take children and draw a border around
 * them. That is deliberate: the moment a frame knows about a storage provider
 * it stops being reusable by the other block.
 *
 * Both are kept light on purpose. A photoreal macOS window or a glossy iPhone
 * bezel dates immediately, competes with the work for attention, and puts
 * somebody else's product design in the middle of this portfolio. These are
 * suggestions of a browser and a phone, drawn with the site's own lines.
 */

/**
 * A minimal browser window: a title bar with three dots and an address strip.
 *
 * Not Safari, not Chrome, not a recognisable anything — the dots are the
 * universal shorthand and the strip is a grey rounded rectangle.
 */
export function BrowserFrame({
  children,
  className,
  /** Shown in the address strip. A label, not a real URL bar. */
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-line bg-raise shadow-card",
        className
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
        </span>
        <span
          aria-hidden
          className="ml-1 min-w-0 flex-1 truncate rounded bg-line px-2 py-0.5 text-2xs text-faint"
        >
          {label ?? ""}
        </span>
      </div>
      <div className="bg-n-900">{children}</div>
    </div>
  );
}

/**
 * A minimal phone: a rounded outline with a notch-ish bar at the top.
 *
 * Constrained to a sensible reading width rather than stretched to the
 * content column — a phone screenshot blown up to 860px wide stops looking
 * like a phone and starts looking like a mistake.
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.75rem] border-[6px] border-line-strong bg-n-900 shadow-lift",
        className
      )}
    >
      <div className="relative">
        {/* The speaker slot. Its grey comes from the neutral scale rather than
            from a semantic colour with an opacity modifier on it: the semantic
            colours are bare `var(--x)` in tailwind.config.ts, and a modifier
            applied to one of those compiles to nothing at all, which would
            leave this element invisible. See tests/tailwind-tokens.test.ts. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 z-10 h-1.5 w-16 -translate-x-1/2 rounded-full bg-n-700"
        />
        {children}
      </div>
    </div>
  );
}
