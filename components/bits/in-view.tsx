"use client";

import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * "Wait until this is on screen, then play — once."
 *
 * The one piece of HILMAN BITS that runs in the browser on behalf of the
 * others. It is useSettle() from components/blocks/gallery/stack.tsx taken
 * out so that anything can use it, and it keeps the rules that pile has
 * always lived by:
 *
 *   - The server sends the element finished. Nothing is ever hidden waiting
 *     for JavaScript, so with no script at all the page reads as it will.
 *   - Once the page is live, anything already on screen stays exactly where
 *     it is: it has been seen. Anything further down is put back to where its
 *     entrance starts (`data-bits-view="waiting"`), out of sight, so it has
 *     something to arrive from — and as it comes into view it plays
 *     (`data-bits-view="playing"`). Once. Never again, never in reverse.
 *   - What "waiting" and "playing" look like belongs to each primitive, in
 *     components/bits/bits.css, and only ever inside a screen,
 *     no-preference media block: printing and reduced motion can only get
 *     the finished page.
 *
 * Two things differ from the pile. One observer serves every element on the
 * page instead of one each. And the state is written straight onto the
 * element rather than through React state — it is a single attribute that CSS
 * reads, and re-rendering everything inside (a heading, a whole section) just
 * to change it would be all cost and no benefit.
 *
 * Not scroll-linked on purpose: a CSS view() timeline would tie the entrance
 * to the scroll position, so it could stop halfway if the reader stopped, and
 * run backwards when they scrolled up.
 */
export function InView({
  as = "div",
  className,
  style,
  children,
  ...data
}: {
  as?: InViewTag;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Passed through, for the primitive's own hooks (data-trigger, data-stagger…). */
  [attribute: `data-${string}`]: string | undefined;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    // Reduced motion never waits for anything. The stylesheet agrees
    // independently, so a preference that changes later is covered too.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    watched.add(node);
    observer().observe(node);
    return () => release(node);
  }, []);

  return createElement(as, { ref, className, style, ...data }, children);
}

type InViewTag = "div" | "span" | "section" | "header" | "p" | "li";

/**
 * Elements whose first sighting is still to come. After it they are either
 * released (already on screen) or waiting (below the fold) — and a waiting
 * element is released the moment it plays.
 */
const watched = new WeakSet<Element>();
const waiting = new WeakSet<Element>();

let shared: IntersectionObserver | null = null;

function observer() {
  shared ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const node = entry.target as HTMLElement;
        if (waiting.has(node)) {
          if (entry.isIntersecting) {
            node.dataset.bitsView = "playing";
            release(node);
          }
          continue;
        }
        if (!watched.has(node)) continue;
        watched.delete(node);
        // The first sighting, measured against the whole viewport rather than
        // the trigger margin, so something peeking over the fold stays put
        // instead of vanishing to make an entrance.
        const box = entry.boundingClientRect;
        if (box.top < window.innerHeight && box.bottom > 0) {
          release(node);
        } else {
          node.dataset.bitsView = "waiting";
          waiting.add(node);
        }
      }
    },
    // Plays a little inside the screen, not on the very edge of it, so the
    // entrance happens where the reader is looking.
    { rootMargin: "0px 0px -10% 0px" }
  );
  return shared;
}

function release(node: Element) {
  watched.delete(node);
  waiting.delete(node);
  shared?.unobserve(node);
}
