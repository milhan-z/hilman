"use client";

import { cn } from "@/lib/utils";

/**
 * Adding a block.
 *
 * This used to sit beside <InsertZone />, a hover-reveal `+` with its own grid
 * of block types. Neither half of that works with a finger, and on a desktop it
 * was a second, smaller block picker with no route to templates or import — so
 * the same editor offered less on a laptop than on a phone. It is gone; this is
 * the one way to add a block at every width.
 *
 * A quiet hairline with a `+` on it, at a real 44px target, handing over to the
 * Add sheet. It reads as a seam in the writing rather than as a control, which
 * is the point — the canvas is meant to look like the document, and an
 * always-visible button per block is how it stopped looking like one.
 */
export function InlineAdd({
  onAdd,
  label = "Add a block here",
  className,
}: {
  onAdd: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={label}
      className={cn(
        "group/add relative flex min-h-11 w-full items-center justify-center",
        className
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 h-px bg-line transition-colors group-active/add:bg-pen"
      />
      <span
        aria-hidden
        className="relative flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-faint transition-colors group-active/add:border-pen group-active/add:text-pen"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
    </button>
  );
}
