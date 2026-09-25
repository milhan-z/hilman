import { createElement, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { InView } from "./in-view";

/** The longest a reveal may wait before it starts. */
const MAX_DELAY = 600;

/**
 * A stagger step in milliseconds: 0 for none, otherwise 40–80.
 *
 * Only the first six children are staggered — the sixth and any after it
 * arrive together — so a sequence never spreads over more than five steps,
 * 400ms at the most. Past that it stops reading as one gesture and starts
 * reading as a queue.
 */
export function revealStagger(stagger: number | undefined): number {
  if (typeof stagger !== "number" || !Number.isFinite(stagger) || stagger <= 0) return 0;
  return Math.min(80, Math.max(40, Math.round(stagger)));
}

/**
 * The details around a title, inked in after it.
 *
 * Each child rises a few pixels (--motion-rise) and fades up, once. No blur
 * and nothing letter by letter: this is type settling onto paper, not text
 * performing. With `stagger`, the direct children arrive one after another;
 * without it the whole block arrives at once. Lines are whatever the
 * children are — splitting a paragraph into its rendered lines would mean
 * measuring it with JavaScript and splitting it again on every resize, and
 * one line at a time is not worth that.
 *
 * `trigger="load"` plays as the page paints, from CSS alone: a server
 * component that ships nothing. `trigger="view"` waits for the element to
 * come on screen (InView), for something further down the page.
 *
 * Never around a page's title or its largest element. The title is what the
 * first paint is for — the reveal is for what surrounds it — and an entrance
 * on the largest element would be an entrance on the page's LCP.
 *
 * The HTML is the finished page. With no JavaScript, `load` still plays and
 * `view` is simply there; with reduced motion, or printed, everything is
 * where it will end up from the start.
 */
export function EditorialReveal({
  children,
  as = "div",
  trigger = "load",
  stagger,
  delay = 0,
  className,
}: {
  children: ReactNode;
  as?: "div" | "section" | "header" | "p" | "li";
  /** "load" plays as the page opens; "view" when it scrolls into sight. */
  trigger?: "load" | "view";
  /** Milliseconds between one child and the next (40–80); none by default. */
  stagger?: number;
  /** Milliseconds before the first child starts (at most 600). */
  delay?: number;
  className?: string;
}) {
  const step = revealStagger(stagger);
  const props = {
    className: cn("bits-reveal", className),
    style: {
      "--bits-reveal-delay": `${Math.min(MAX_DELAY, Math.max(0, delay))}ms`,
      ...(step && { "--bits-reveal-stagger": `${step}ms` }),
    } as CSSProperties,
    "data-trigger": trigger,
    "data-stagger": step ? "" : undefined,
  };

  if (trigger === "view") {
    return (
      <InView as={as} {...props}>
        {children}
      </InView>
    );
  }
  return createElement(as, props, children);
}
