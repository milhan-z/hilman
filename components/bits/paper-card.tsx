import Link from "next/link";
import { createElement, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * How far a lifted card leans, in degrees, by lift. Six of each, alternating
 * sides and uneven on purpose: enough for a row of cards to read as paper
 * picked up by hand rather than as one card copied.
 */
const TILTS = {
  md: [-0.6, 0.45, -0.3, 0.6, -0.45, 0.3],
  sm: [-0.25, 0.2, -0.12, 0.25, -0.2, 0.12],
} as const;

/** FNV-1a: a short, stable number for a string seed such as a uuid. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * The lean of a card with this seed, in degrees: the same seed, the same
 * lean, on the server and in the browser and on every render.
 *
 * A seed rather than a position in the list. The explorers filter and
 * reorder their cards, and a card that leaned left under "All" and right
 * under "Design" would be a card that cannot make up its mind.
 */
export function paperTilt(seed: string | number, lift: "sm" | "md" = "md"): number {
  const n =
    typeof seed === "string" ? hash(seed) : Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0;
  return TILTS[lift][n % TILTS[lift].length];
}

/**
 * A card lifted a little off the desk: up a few pixels, leaning a fraction
 * of a degree, its shadow deepening. That is the whole idea, and all there
 * is — no glow, no tilt that follows the pointer, no spotlight.
 *
 * - Hover lifts it only where there is a real pointer
 *   (`(hover: hover) and (pointer: fine)`); a tap on a phone never leaves a
 *   card stuck in the air.
 * - Keyboard focus gets the same lift, on any device.
 * - A finger gets a press instead: the card gives a little under it.
 * - Reduced motion keeps the deeper shadow and nothing that moves.
 *
 * The deeper shadow is --shadow-lift on a pseudo-element that fades in.
 * Animating `box-shadow` repaints the whole card on every frame of the
 * transition; opacity costs next to nothing.
 *
 * `md` is for grid cards (4px, up to 0.6°), `sm` for wide rows, where the
 * same angle would swing the far end of the row by several pixels (2px, up
 * to 0.25°). The card's look — border, background, padding, radius — stays
 * with the caller, in `className`; the movement belongs here.
 */
export function PaperCard({
  children,
  href,
  as = "div",
  seed = 0,
  lift = "md",
  className,
}: {
  children: ReactNode;
  /** A link to follow; the card is then that link. */
  href?: string;
  /** The element when the card is not a link. */
  as?: "div" | "article" | "li";
  /** Which way, and how far, the card leans when lifted — an id is ideal. */
  seed?: string | number;
  lift?: "sm" | "md";
  className?: string;
}) {
  const props = {
    className: cn("bits-paper", className),
    "data-lift": lift,
    style: { "--bits-paper-tilt": `${paperTilt(seed, lift)}deg` } as CSSProperties,
  };
  if (href) {
    return (
      <Link href={href} {...props}>
        {children}
      </Link>
    );
  }
  return createElement(as, props, children);
}
