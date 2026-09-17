"use client";

import { useEffect } from "react";

/**
 * Holding the page still while a sheet is open, without moving it.
 *
 * The obvious implementation — `body { overflow: hidden }` — has a defect that
 * is invisible on a desktop and very visible on a phone. Hiding the body's
 * overflow while the document is scrolled leaves the layout viewport unable to
 * accommodate the current scroll offset, so the browser compensates by shifting
 * the *visual* viewport instead. Restoring `overflow` on close puts the
 * overflow back but nothing puts the viewport back, and
 * `visualViewport.offsetTop` is left permanently non-zero.
 *
 * That single stale number is enough to break two things at once:
 *
 *   `position: sticky` resolves against the layout viewport, so an app header
 *   pinned to `top: 0` renders that many pixels above where the top of the
 *   screen now appears to be — the header looks pulled out of place, and iOS
 *   rubber-band scrolling widens the gap while you are bouncing the page.
 *
 *   <KeyboardInset /> measures the keyboard as
 *   `innerHeight - visualViewport.height - visualViewport.offsetTop`, so a
 *   stale offset makes it under-report the keyboard from then on.
 *
 * The fix is to take the scroll offset out of the document entirely for as
 * long as the sheet is up: pin the body at a negative top, which leaves the
 * layout viewport at zero and nothing for the browser to compensate for, then
 * put the scroll back exactly where it was on the way out.
 *
 * Counted rather than boolean, because one sheet can open another — a block's
 * Add sheet handing over to the media picker — and the second one unlocking
 * the page would drop the first one's remembered position on the floor.
 *
 * It does nothing at all when the document is not the scroller. Inside the
 * mobile editor the shell is `fixed inset-0` and the canvas scrolls itself, so
 * there is no page position to preserve and pinning the body would be motion
 * for its own sake — it would also fight the shell for the same pixels. Rather
 * than growing a second lock for editor sheets, the existing one asks whether
 * there is anything to lock and declines when there is not. Every non-editor
 * Studio screen is still a plain scrolling document and still gets the full
 * treatment.
 */

interface LockedState {
  scrollY: number;
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
}

let depth = 0;
let saved: LockedState | null = null;

/** Whether the page itself can scroll, and therefore has a position to keep. */
function documentScrolls(): boolean {
  return document.documentElement.scrollHeight > window.innerHeight + 1;
}

function lock() {
  depth += 1;
  if (depth > 1) return;
  if (!documentScrolls()) return;

  const body = document.body;
  const scrollY = window.scrollY;

  saved = {
    scrollY,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };

  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  // A fixed body collapses to its content width without this.
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlock() {
  depth = Math.max(0, depth - 1);
  if (depth > 0 || !saved) return;

  const body = document.body;
  const { scrollY, ...styles } = saved;
  saved = null;

  body.style.position = styles.position;
  body.style.top = styles.top;
  body.style.left = styles.left;
  body.style.right = styles.right;
  body.style.width = styles.width;
  body.style.overflow = styles.overflow;

  // Instant, and before paint: a smooth scroll here would animate the page
  // back under a sheet that has already gone.
  window.scrollTo({ top: scrollY, left: 0, behavior: "instant" as ScrollBehavior });
}

/** Locks the page for as long as `active` is true. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}

/** Exposed for the test harness; not part of the component contract. */
export const __scrollLockDepth = () => depth;
