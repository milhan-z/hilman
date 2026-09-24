"use client";

import { useRef, useState } from "react";
import { useReducedMotion } from "../../use-reduced-motion";
import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import { Lightbox, useLightbox } from "../lightbox";
import { itemLabel, type GalleryItem } from "./shared";

/**
 * Panels side by side, one of them open.
 *
 * For a set where one image is the point and the others are context — a
 * selected exploration with its alternates, a final frame with the frames
 * around it. The closed panels stay visible as slivers, so the set reads as a
 * set rather than as a single image with hidden extras.
 *
 * ── activation is a click, never a hover ──
 *
 * The usual version of this pattern opens on hover, which means on a phone it
 * opens on nothing. Here every panel is a real `<button>`: tap works, click
 * works, Tab reaches it, Enter and Space activate it, and the arrow keys move
 * between panels because that is cheap once the buttons exist. Hover is added
 * on top as a pointer nicety — it previews, it does not decide.
 *
 * ── the phone is not a squeezed desktop ──
 *
 * The row stays a row, but the open panel takes a much larger share of it and
 * the whole thing is shorter, so at 390px it reads as a strip with one image
 * open rather than as six unreadable columns. The concept survives; the
 * proportions change.
 */
export function GalleryAccordion({ items }: { items: GalleryItem[] }) {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const lightbox = useLightbox();
  const panelRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (items.length === 0) return null;

  const move = (to: number) => {
    const next = Math.max(0, Math.min(to, items.length - 1));
    setActive(next);
    panelRefs.current[next]?.focus();
  };

  return (
    <div
      className="!max-w-none"
      role="group"
      aria-label={`Gallery, ${items.length} images`}
    >
      <div className="flex h-[16rem] gap-1.5 sm:h-[22rem] sm:gap-2">
        {items.map((item, i) => {
          const isActive = i === active;
          return (
            <button
              key={i}
              ref={(node) => {
                panelRefs.current[i] = node;
              }}
              type="button"
              aria-pressed={isActive}
              aria-label={
                isActive
                  ? `Open ${itemLabel(item, i, items.length)}`
                  : itemLabel(item, i, items.length)
              }
              /* One control, two meanings, in the order somebody actually
                 wants them: a closed panel opens, and the panel that is
                 already open shows the whole photograph. Tapping the open
                 panel used to do nothing at all, which is a dead target
                 sitting where the most obvious one should be. */
              onClick={() => (isActive ? lightbox.open(i) : setActive(i))}
              onMouseEnter={() => setActive(i)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  move(i + 1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  move(i - 1);
                }
              }}
              className={cn(
                "group relative min-w-0 overflow-hidden rounded-md border bg-raise",
                isActive && "cursor-zoom-in",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen",
                isActive ? "border-pen" : "border-line",
                // The open panel takes more of the row on a phone, where there
                // is less of it to share.
                isActive ? "flex-[4] sm:flex-[3]" : "flex-[1]",
                reduced ? "" : "transition-[flex] duration-base ease-out"
              )}
            >
              <Pic
                src={item.src}
                alt={item.alt}
                width={1200}
                height={1600}
                sizes="(max-width: 640px) 60vw, 40vw"
                className={cn(
                  "h-full w-full object-cover",
                  reduced ? "" : "transition-opacity duration-base",
                  isActive ? "opacity-100" : "opacity-70"
                )}
              />

              {/* The caption belongs to the open panel — a closed sliver has no
                  room for words, and stacking them all would be noise. */}
              {isActive && item.caption && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-2 pt-8 text-left font-hand text-base text-cream">
                  {item.caption}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {itemLabel(items[active], active, items.length)}
      </p>

      <Lightbox
        items={items}
        index={lightbox.index}
        onClose={lightbox.close}
        onIndex={lightbox.setIndex}
      />
    </div>
  );
}
