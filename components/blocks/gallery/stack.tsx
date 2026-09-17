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
 * ── the tilt is a function, not a dice roll ──
 *
 * Every offset and rotation below comes from the item's index through a fixed
 * table. That matters more than it looks: `Math.random()` here would give a
 * different pile on the server and in the browser — a hydration mismatch — and
 * then a different one again on every re-render, so a gallery would rearrange
 * itself while somebody was looking at it. Same index, same tilt, forever.
 *
 * ── staying readable ──
 *
 * The overlap is vertical and small, and the angles are under three degrees,
 * so no photograph is ever mostly behind another one. The cascade runs down
 * the page rather than across it, which is what keeps it working at 390px:
 * each card is most of the width whatever the screen is, and a long gallery
 * gets longer rather than more chaotic.
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

export function GalleryStack({ items }: { items: GalleryItem[] }) {
  const reduced = useReducedMotion();
  if (items.length === 0) return null;

  return (
    /* Two elements, because they are doing opposite jobs. The outer one opts
       out of the prose column the way every other media block does; the inner
       one then puts a width back on. Written as one element, `!max-w-none`
       wins over `max-w-[34rem]` — `!important` beats source order — and the
       pile silently grows to the full width of the page. */
    <div className="!max-w-none">
      <div className="mx-auto w-full max-w-[34rem] pb-2">
        {items.map((item, i) => {
          const tilt = TILTS[i % TILTS.length];
          const settled = {
            opacity: 1,
            y: 0,
            rotate: tilt.rotate,
          };

          return (
            <motion.figure
              key={i}
              style={{
                // Percent of the card's own width, so the lean is the same
                // shape on a phone as on a laptop.
                marginLeft: `${Math.max(0, tilt.shift)}%`,
                marginRight: `${Math.max(0, -tilt.shift)}%`,
                // Later cards sit on top, the way a real pile works.
                zIndex: i + 1,
                position: "relative",
                // Everything after the first overlaps the one above it.
                marginTop: i === 0 ? 0 : "-1.75rem",
              }}
              initial={reduced ? false : { opacity: 0, y: 18, rotate: tilt.rotate }}
              whileInView={settled}
              animate={reduced ? settled : undefined}
              viewport={{ once: true, margin: "0px 0px -40px 0px" }}
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : i * 0.05 }}
            >
              <div className={cn("overflow-hidden rounded-md border border-line bg-paper p-1.5 shadow-lift", "sm:p-2")}>
                <Pic
                  src={item.src}
                  alt={item.alt}
                  width={1100}
                  height={825}
                  sizes="(max-width: 640px) 92vw, 34rem"
                  className="w-full rounded-sm"
                />
                {item.caption && (
                  <figcaption className="px-1 pb-0.5 pt-2 font-hand text-base text-faint">
                    {item.caption}
                  </figcaption>
                )}
              </div>
            </motion.figure>
          );
        })}
      </div>
    </div>
  );
}
