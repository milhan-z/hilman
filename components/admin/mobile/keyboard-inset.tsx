"use client";

import { useEffect } from "react";

/**
 * How much of the screen the keyboard is currently covering, as a CSS variable.
 *
 * iOS Safari does not shrink the layout viewport when the keyboard comes up —
 * it shrinks the *visual* viewport and leaves the page the same height
 * underneath. So a bar pinned to the bottom of the page is pinned to a place
 * that is now behind the keyboard, which is how a save button disappears at
 * the exact moment you have finished typing.
 *
 * `interactiveWidget: "resizes-content"` in the layout's viewport export fixes
 * this where it is supported. This covers the browser this studio is actually
 * used in, and the two compose: when the layout viewport does shrink,
 * innerHeight shrinks with it and the measurement below comes out at zero, so
 * nothing is compensated for twice.
 *
 * Renders nothing. `--keyboard-inset` is read by the editor's action bar and
 * by the sheets' pinned actions.
 */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const measure = () => {
      frame = 0;
      // offsetTop matters when the page is pinch-zoomed or scrolled under the
      // keyboard; without it the bar drifts as you scroll a focused field.
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      const inset = Math.max(0, Math.round(covered));
      root.style.setProperty("--keyboard-inset", `${inset}px`);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);

    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--keyboard-inset");
    };
  }, []);

  return null;
}
