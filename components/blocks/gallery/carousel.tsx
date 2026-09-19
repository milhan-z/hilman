"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import { Lightbox, ZoomTrigger, useLightbox } from "../lightbox";
import { itemLabel, type GalleryItem } from "./shared";

/**
 * A series, one at a time, with the neighbours showing at the edges.
 *
 * The scrolling is the browser's. `overflow-x: auto` with `scroll-snap-type:
 * x mandatory` gives real momentum on a phone, real trackpad behaviour on a
 * laptop, a real scrollbar-free swipe, and correct interruption when someone
 * grabs it mid-glide — none of which a JavaScript drag implementation gets
 * right without a great deal of code. React is left with what it is good at:
 * knowing which slide is centred, and moving the scroll when a button is
 * pressed.
 *
 * That is also why there is no carousel dependency here. Swiper would bring a
 * few tens of kilobytes to re-implement `scroll-snap`.
 *
 * It never advances by itself. A carousel that moves while you are reading is
 * a carousel you have to race, and the WAI guidance on auto-rotation exists
 * because of exactly that.
 */
export function GalleryCarousel({ items }: { items: GalleryItem[] }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const lightbox = useLightbox();

  // Which slide is nearest the middle of the viewport, recomputed from the
  // scroll position itself rather than tracked as the buttons move it — a
  // swipe moves it too, and the indicator has to follow both.
  const syncActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const middle = track.scrollLeft + track.clientWidth / 2;
    let closest = 0;
    let best = Infinity;
    for (let i = 0; i < track.children.length; i += 1) {
      const child = track.children[i] as HTMLElement;
      const distance = Math.abs(child.offsetLeft + child.offsetWidth / 2 - middle);
      if (distance < best) {
        best = distance;
        closest = i;
      }
    }
    setActive(closest);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncActive();
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    syncActive();
    return () => {
      track.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [syncActive]);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track) return;
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      const child = track.children[clamped] as HTMLElement | undefined;
      if (!child) return;
      track.scrollTo({
        left: child.offsetLeft - (track.clientWidth - child.offsetWidth) / 2,
        behavior: reduced ? "auto" : "smooth",
      });
    },
    [items.length, reduced]
  );

  if (items.length === 0) return null;

  return (
    <section
      className="!max-w-none"
      aria-roledescription="carousel"
      aria-label={`Gallery, ${items.length} images`}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          goTo(active + 1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          goTo(active - 1);
        }
      }}
    >
      <ul
        ref={trackRef}
        // px matches half the leftover width of a slide, so the first and last
        // can sit in the middle like every other one.
        //
        // The `sm` pair used to be 60% inside 20% padding, which made the
        // slide 36% of the region — measured at 768 that was a 228px picture,
        // *smaller* than the 236px the same carousel gives at 390. A wider
        // screen handing back a smaller photograph is the same fault the
        // project grid had. 68% inside 16% keeps it growing: 236px at 390,
        // 291px at 768, 423px at 1440 in a Works column.
        className={cn(
          "scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9%] py-1 sm:gap-4 sm:px-[16%]",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        )}
        tabIndex={0}
      >
        {items.map((item, i) => (
          <li
            key={i}
            className="w-[82%] shrink-0 snap-center sm:w-[68%]"
            aria-label={`${i + 1} of ${items.length}`}
          >
            <figure>
              <ZoomTrigger
                onOpen={() => lightbox.open(i)}
                label={`Open ${itemLabel(item, i, items.length)}`}
                className={cn(
                  "overflow-hidden rounded-md border border-line bg-raise",
                  // The neighbours are present but plainly not the subject.
                  "transition-opacity duration-base",
                  i === active ? "opacity-100" : "opacity-55"
                )}
              >
                <Pic
                  src={item.src}
                  alt={item.alt}
                  width={1200}
                  height={900}
                  sizes="(max-width: 640px) 82vw, 60vw"
                  className="aspect-[4/3] w-full object-cover"
                />
              </ZoomTrigger>
              {item.caption && (
                <figcaption className="mt-2 font-hand text-base text-faint">
                  {item.caption}
                </figcaption>
              )}
            </figure>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-center gap-3">
        <CarouselButton
          label="Previous image"
          disabled={active === 0}
          onClick={() => goTo(active - 1)}
          glyph="M15 18l-6-6 6-6"
        />

        {/* Position, not navigation — the dots are small and the buttons
            beside them are the target. */}
        <ol className="flex items-center gap-1.5" aria-hidden>
          {items.map((_, i) => (
            <li
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-base",
                i === active ? "w-4 bg-pen" : "w-1.5 bg-line-strong"
              )}
            />
          ))}
        </ol>

        <CarouselButton
          label="Next image"
          disabled={active === items.length - 1}
          onClick={() => goTo(active + 1)}
          glyph="M9 18l6-6-6-6"
        />
      </div>

      <p aria-live="polite" className="sr-only">
        {itemLabel(items[active] ?? items[0], active, items.length)}
      </p>

      <Lightbox
        items={items}
        index={lightbox.index}
        onClose={lightbox.close}
        onIndex={lightbox.setIndex}
      />
    </section>
  );
}

function CarouselButton({
  label,
  glyph,
  disabled,
  onClick,
}: {
  label: string;
  glyph: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface",
        "text-soft transition-colors hover:border-pen hover:text-pen",
        "disabled:pointer-events-none disabled:opacity-35"
      )}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={glyph} />
      </svg>
    </button>
  );
}
