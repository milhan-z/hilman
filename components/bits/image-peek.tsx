import type { CSSProperties } from "react";
import { mediaSrc } from "@/lib/cloudinary";

/**
 * A photograph tucked behind a card, the top of it peeking out over the
 * card's edge while a real pointer rests on the card, or the keyboard is on
 * it: the next work's picture behind "Next", a journal entry's cover behind
 * its card. Only a strip shows — the card hides the rest — so it never
 * covers whatever sits above the card (measured: a whole print over "Next"
 * lay across the "Let's talk" button).
 *
 * - Decoration only (`aria-hidden`): the card's own words say where it goes.
 * - No JavaScript at all. The picture is a `background-image` that only the
 *   hover and focus rules in components/bits/bits.css set, so the browser
 *   fetches it the first time it is wanted and never before — and on a phone,
 *   where there is no hover, never.
 * - It does not follow the pointer (the rulebook: no cursor that follows
 *   you). It rises a few pixels into place and fades in; reduced motion gets
 *   the picture without the rise.
 *
 * Put it inside a PaperCard (it answers `.bits-paper:hover`), as its first
 * child, on the side the card's words point to.
 */
export function ImagePeek({ src, side = "right" }: { src: string | null | undefined; side?: "left" | "right" }) {
  const url = mediaSrc(src, { width: 320 });
  if (!url) return null;
  return (
    <span
      aria-hidden
      className={`bits-peek ${side === "left" ? "left-5" : "right-5"}`}
      style={
        {
          "--bits-peek-src": `url("${cssUrl(url)}")`,
          "--bits-peek-tilt": side === "left" ? "-3deg" : "3deg",
        } as CSSProperties
      }
    >
      <span className="bits-peek-print rounded-sm border-4 border-cream bg-cream shadow-card" />
    </span>
  );
}

/**
 * A URL made safe to sit inside `url("…")` in an inline style: the few
 * characters that could end the string or the function are percent-encoded,
 * which is how a URL would carry them anyway.
 */
export function cssUrl(url: string): string {
  // Percent-encoded by hand: encodeURIComponent leaves ( ) and ' as they are.
  return url.replace(/["'()\\\s]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}
