"use client";

import { useEffect, useRef } from "react";

/**
 * Thin yellow reading-progress bar pinned to the top of the viewport.
 *
 * Driven by CSS where the browser can do it — `animation-timeline: scroll()`,
 * see `.scroll-progress` in app/globals.css — which runs on the compositor and
 * costs no JavaScript per frame. This used to be Framer Motion's useScroll +
 * useSpring, which put the whole animation library into the first download of
 * every public page for a two-pixel line.
 *
 * Browsers without scroll-driven animations get the same bar from one passive
 * scroll listener, batched to one write per frame.
 */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof CSS !== "undefined" && CSS.supports?.("animation-timeline: scroll()")) return;
    const node = bar.current;
    if (!node) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      const root = document.documentElement;
      const max = root.scrollHeight - root.clientHeight;
      const progress = max > 0 ? Math.min(1, Math.max(0, root.scrollTop / max)) : 0;
      node.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={bar}
      aria-hidden
      className="scroll-progress fixed inset-x-0 top-0 z-[200] h-[2px] origin-left bg-gradient-to-r from-pen to-pen-deep shadow-glow"
    />
  );
}
