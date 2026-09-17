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
 * It scrolls the window, because the document is this app's scroll owner and
 * introducing a nested scroller to make dragging easier would make everything
 * else — sticky chrome, the keyboard, momentum — harder.
 */

export interface DragEdgeScrollOptions {
  /** True only while a block is actually off the ground. */
  active: boolean;
  /** Height of the fixed chrome at each edge, so the zones sit inside it. */
  topInset?: number;
  bottomInset?: number;
}

export function useDragEdgeScroll({
  active,
  topInset = 0,
  bottomInset = 0,
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

      const velocity = edgeScrollVelocity({
        pointerY: y,
        viewportHeight: window.innerHeight,
        topInset: insets.current.topInset,
        bottomInset: insets.current.bottomInset,
        zone: EDGE_ZONE_PX,
      });
      if (velocity === 0) return;

      // Nothing to do at the ends of the document; scrolling past them on iOS
      // starts a rubber-band the drag would then fight.
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
  }, [active]);
}
