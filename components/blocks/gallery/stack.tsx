"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "./shared";

/**
 * Photographs dropped on a desk, in the order they were taken.
 *
 * For the things a grid makes worse: chat screenshots, a process in four
 * steps, the moments from one evening. A grid says "here are six equivalent
 * items". A pile says "these belong together and they happened in this order",
 * which is usually the actual claim.
 *
 * ── the same pile, turned ──
 *
 * On a phone the cascade runs *down* the page: each card is most of the width
 * whatever the screen is, and a long gallery gets longer rather than more
 * chaotic. On a desktop there is width to spare and very little height to
 * spare, so the same pile is dealt *across* instead — a hand of cards, fanned
 * left to right, later ones on top.
 *
 * It is one set of elements laid out two ways, not two copies of the gallery:
 * the offsets are CSS custom properties and the breakpoint decides which of
 * them are read. Nothing is rendered twice, and no image is fetched twice.
 *
 * ── the tilt is a function, not a dice roll ──
 *
 * Every offset and rotation below comes from the item's index through a fixed
 * table. That matters more than it looks: `Math.random()` here would give a
 * different pile on the server and in the browser — a hydration mismatch — and
 * then a different one again on every re-render, so a gallery would rearrange
 * itself while somebody was looking at it. Same index, same tilt, forever.
 */

/** Index → tilt. Six entries, cycled: enough variety to read as a pile. */
const TILTS = [
  { rotate: -2.4, shift: -5 },
  { rotate: 1.8, shift: 6 },
  { rotate: -1.1, shift: -2 },
  { rotate: 2.2, shift: 4 },
  { rotate: -1.7, shift: -6 },
  { rotate: 1.2, shift: 2 },
] as const;

/**
 * How wide each card is, and how far the next one sits over it, as a
 * percentage of the row — solved so the whole fan lands inside the column
 * instead of running off the side of it.
 *
 * The overlap is capped at 42% of a card. Past that a photograph is more
 * hidden than shown, and since a fan cannot be hovered on a phone there is no
 * way to get it back — so when the arithmetic would need more than that, the
 * fan is refused and the pile stays vertical. In practice that happens at
 * about eleven images, which is well past the point where a fan was a good
 * idea anyway.
 */
export function fanGeometry(count: number) {
  // 96, not 100: the cards are rotated, and the corners need somewhere to go.
  const card = Math.max(16, Math.min(44, 96 / (1 + 0.62 * (count - 1))));
  const exact = count > 1 ? (count * card - 96) / (count - 1) : 0;
  const shift = Math.min(Math.max(exact, card * 0.18), card * 0.42);
  const total = card + (count - 1) * (card - shift);
  return { card, shift, fits: count > 1 && total <= 97 };
}

export function GalleryStack({ items }: { items: GalleryItem[] }) {
  const reduced = useReducedMotion();
  if (items.length === 0) return null;

  const fan = fanGeometry(items.length);

  return (
    /* Two elements, because they are doing opposite jobs. The outer one opts
       out of the prose column the way every other media block does; the inner
       one then puts a width back on. Written as one element, `!max-w-none`
       wins over `max-w-[34rem]` — `!important` beats source order — and the
       pile silently grows to the full width of the page.

       The cap is lifted at `sm`, where the fan wants the whole column. */
    <div className="!max-w-none">
      <div
        className={cn(
          "mx-auto w-full max-w-[34rem] pb-2 sm:max-w-none",
          fan.fits && "sm:flex sm:items-center sm:justify-center sm:pb-6"
        )}
      >
        {items.map((item, i) => {
          const tilt = TILTS[i % TILTS.length];
          const settled = { opacity: 1, y: 0, rotate: tilt.rotate };

          return (
            /* Position lives out here, in classes a media query can reach.
               The rotation and the entrance animation live on the motion
               element inside, because Framer Motion writes `transform`
               inline and an inline transform beats any class — the two
               cannot share one element without one of them losing. */
            <div
              key={i}
              style={
                {
                  zIndex: i + 1,
                  position: "relative",
                  // Phone: lean left or right by a share of the card's width.
                  "--lean-l": `${Math.max(0, tilt.shift)}%`,
                  "--lean-r": `${Math.max(0, -tilt.shift)}%`,
                  // Desktop: how wide this card is, how far it sits over the
                  // one before it, and a few pixels up or down so the row
                  // reads as a pile rather than as a shelf.
                  "--card": `${fan.card}%`,
                  "--shift": i === 0 ? "0px" : `-${fan.shift}%`,
                  "--lift": `${tilt.shift}px`,
                } as React.CSSProperties
              }
              className={cn(
                "ml-[var(--lean-l)] mr-[var(--lean-r)]",
                // Everything after the first overlaps the one above it.
                i === 0 ? "mt-0" : "-mt-7",
                fan.fits &&
                  "sm:ml-[var(--shift)] sm:mr-0 sm:mt-[var(--lift)] sm:w-[var(--card)] sm:shrink-0"
              )}
            >
              <motion.figure
                initial={reduced ? false : { opacity: 0, y: 18, rotate: tilt.rotate }}
                whileInView={settled}
                animate={reduced ? settled : undefined}
                viewport={{ once: true, margin: "0px 0px -40px 0px" }}
                transition={{
                  duration: 0.42,
                  ease: [0.16, 1, 0.3, 1],
                  delay: reduced ? 0 : i * 0.05,
                }}
              >
                <div className="overflow-hidden rounded-md border border-line bg-paper p-1.5 shadow-lift sm:p-2">
                  <Pic
                    src={item.src}
                    alt={item.alt}
                    width={1100}
                    height={825}
                    sizes={`(max-width: 640px) 92vw, ${Math.round(fan.card)}vw`}
                    /* Natural aspect ratio, always. A landscape photograph
                       stays landscape and a portrait one stays portrait,
                       here and at every width.

                       This used to force `aspect-[3/4] object-cover` on the
                       desktop fan, on the theory that a fan only reads as a
                       fan if the cards line up. That was wrong twice over: it
                       cropped the author's photographs to make a layout
                       tidier, which is never a trade this renderer gets to
                       make on its own — and the tidiness was not even the
                       goal. A pile of prints on a desk is uneven. That is
                       what distinguishes it from a shelf. */
                    className="w-full rounded-sm"
                  />
                  {item.caption && (
                    <figcaption
                      className={cn(
                        "px-1 pb-0.5 pt-2 font-hand text-base text-faint",
                        // Narrow cards, so a long caption is trimmed rather
                        // than allowed to push one card taller than the rest.
                        fan.fits && "sm:line-clamp-2 sm:text-sm"
                      )}
                    >
                      {item.caption}
                    </figcaption>
                  )}
                </div>
              </motion.figure>
            </div>
          );
        })}
      </div>
    </div>
  );
}
