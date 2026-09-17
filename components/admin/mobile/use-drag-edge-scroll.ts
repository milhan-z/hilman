"use client";

import { useEffect, useRef } from "react";
import { EDGE_ZONE_PX, edgeScrollVelocity } from "@/lib/studio-gestures";

/**
 * Moving the page while a block is being dragged.
 *
 * Framer Motion reorders a list beautifully and does not scroll for you — the
 * installed version has no auto-scroll code at all. Without this, a drag can
 * only reach as far as the screen: block 2 cannot become block 15, because the
 * finger runs out of viewport long before the list runs out of blocks.
 *
 * The whole loop lives outside React. Pointer position is a ref, the scrolling
 * happens in requestAnimationFrame, and no state is set — a drag that
 * re-rendered the editor sixty times a second would undo the reason the
 * reorder preview was split from the document in the first place.
 *
 * It scrolls whichever element actually owns the scrolling. On a phone the
 * editor is now an app shell with its own canvas (see <MobileEditorShell />),
 * so there is a container to move; on desktop the document is still the
 * scroller and `window` is the thing to move. Passing the element in keeps
 * that decision with the editor rather than duplicating it here.
 */

export interface DragEdgeScrollOptions {
  /** True only while a block is actually off the ground. */
  active: boolean;
  /** Height of the fixed chrome at each edge, so the zones sit inside it. */
  topInset?: number;
  bottomInset?: number;
  /**
   * The element that scrolls. Null or undefined means the window, which is
   * still the case on desktop and on any screen that is a plain document.
   */
  container?: React.RefObject<HTMLElement | null>;
}

export function useDragEdgeScroll({
  active,
  topInset = 0,
  bottomInset = 0,
  container,
}: DragEdgeScrollOptions) {
  const pointerY = useRef<number | null>(null);
  const insets = useRef({ topInset, bottomInset });
  insets.current = { topInset, bottomInset };

  useEffect(() => {
    if (!active) return;

    let frame = 0;

    const track = (event: PointerEvent) => {
      pointerY.current = event.clientY;
    };

    const step = () => {
      frame = requestAnimationFrame(step);
      const y = pointerY.current;
      if (y === null) return;

      const element = container?.current ?? null;
      // The canvas is measured by its own box, not the viewport: its top edge
      // sits below the header and its bottom above the action bar, so the
      // trigger zones land where the content actually ends.
      const box = element?.getBoundingClientRect();
      const viewportHeight = box ? box.height : window.innerHeight;
      const localY = box ? y - box.top : y;

      const velocity = edgeScrollVelocity({
        pointerY: localY,
        viewportHeight,
        topInset: insets.current.topInset,
        bottomInset: insets.current.bottomInset,
        zone: EDGE_ZONE_PX,
      });
      if (velocity === 0) return;

      // Nothing to do at the ends; scrolling past them on iOS starts a
      // rubber-band the drag would then be fighting.
      if (element) {
        const maxScroll = element.scrollHeight - element.clientHeight;
        const next = element.scrollTop + velocity;
        if (next < 0 || next > maxScroll) return;
        element.scrollTop = next;
        return;
      }

      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const next = window.scrollY + velocity;
      if (next < 0 || next > maxScroll) return;
      window.scrollBy(0, velocity);
    };

    // passive: this only reads the pointer; the drag itself is Motion's.
    window.addEventListener("pointermove", track, { passive: true });
    frame = requestAnimationFrame(step);

    return () => {
      window.removeEventListener("pointermove", track);
      cancelAnimationFrame(frame);
      pointerY.current = null;
    };
  }, [active, container]);
}
