"use client";

import type { CSSProperties } from "react";
import { InView } from "../../bits/in-view";
import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import { Lightbox, ZoomTrigger, useLightbox } from "../lightbox";
import { itemLabel, type GalleryItem } from "./shared";

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
 *
 * ── settling onto the desk ──
 *
 * The cards drop into place, one after another, the first time the pile
 * scrolls into view: the HILMAN BITS pile entrance (`.bits-pile-card` in
 * components/bits/bits.css), started by the shared <InView> trigger. The page
 * is sent with the cards already on the desk: a pile that is on screen when
 * the page opens simply stays put, and one further down is lifted out of
 * sight first so it has something to settle from. Nothing is ever hidden
 * waiting for JavaScript, and reduced motion only ever gets the pile at rest,
 * by construction of the stylesheet.
 *
 * This used to be Framer Motion — until the library turned out to be the
 * largest thing every article downloaded, pile or no pile — and then a
 * transition switched on through React state, which re-rendered the whole
 * pile twice to play it once. Now nothing re-renders: the trigger writes one
 * attribute, and CSS does the rest.
 */

/**
 * When each card starts to land, in milliseconds: 60 apart, closer together
 * for a big pile, so that the last one always starts within 400 ms of the
 * first (docs/HILMAN-BITS.md, rule 3) and a long gallery does not keep the
 * reader waiting for its last photograph.
 */
export function settleDelay(index: number, count: number): number {
  if (count < 2 || index < 1) return 0;
  const step = Math.max(40, Math.min(60, 400 / (count - 1)));
  return Math.round(Math.min(index * step, 400));
}

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
  const lightbox = useLightbox();
  if (items.length === 0) return null;

  const fan = fanGeometry(items.length);

  return (
    /* Two elements, because they are doing opposite jobs. The outer one opts
       out of the prose column the way every other media block does; the inner
       one then puts a width back on. Written as one element, `!max-w-none`
       wins over `max-w-[34rem]` — `!important` beats source order — and the
       pile silently grows to the full width of the page.

       The cap is lifted at `sm`, where the fan wants the whole column. The
       outer one is also what waits to come into view. */
    <InView className="!max-w-none">
      <div
        className={cn(
          "mx-auto w-full max-w-[34rem] pb-2 sm:max-w-none",
          fan.fits && "sm:flex sm:items-center sm:justify-center sm:pb-6"
        )}
      >
        {items.map((item, i) => {
          const tilt = TILTS[i % TILTS.length];

          return (
            /* Position lives out here, in classes a media query can reach.
               The tilt and the settling live on the figure inside, which
               moves on its own `rotate` and `translate` — kept apart from
               the layout, so neither can undo the other. */
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
              <figure
                className="bits-pile-card"
                style={
                  {
                    "--bits-pile-tilt": `${tilt.rotate}deg`,
                    "--bits-pile-delay": `${settleDelay(i, items.length)}ms`,
                  } as CSSProperties
                }
              >
                <ZoomTrigger
                  onOpen={() => lightbox.open(i)}
                  label={`Open ${itemLabel(item, i, items.length)}`}
                  className="overflow-hidden rounded-md border border-line bg-paper p-1.5 shadow-lift sm:p-2"
                >
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
                </ZoomTrigger>
              </figure>
            </div>
          );
        })}
      </div>

      <Lightbox
        items={items}
        index={lightbox.index}
        onClose={lightbox.close}
        onIndex={lightbox.setIndex}
      />
    </InView>
  );
}
