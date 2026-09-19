"use client";

import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import { Lightbox, ZoomTrigger, useLightbox } from "../lightbox";
import { itemLabel, type GalleryItem } from "./shared";

/**
 * The gallery as it has always looked.
 *
 * This is lifted out of renderer.tsx unchanged — same classes, same sizes,
 * same `aspect-[4/3]` crop — because every gallery already published is a grid
 * and none of them asked to look different. The presentation feature is
 * additive; the thing it is added to has to stay still.
 *
 * The one thing that did change is that a tile is now a button: a grid crops
 * to a uniform 4:3 on purpose, which makes "let me see the whole photograph"
 * a question the layout itself creates and therefore ought to answer. See
 * components/blocks/lightbox.tsx.
 *
 * `columns` is the legacy two-up value. It is not in the picker any more, but
 * it is in the database, so it keeps meaning what it meant.
 */
export function GalleryGrid({
  items,
  columns = false,
}: {
  items: GalleryItem[];
  columns?: boolean;
}) {
  const lightbox = useLightbox();

  return (
    <div
      className={cn(
        "!max-w-none grid gap-4",
        columns ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {items.map((item, i) => (
        <figure key={i}>
          <ZoomTrigger
            onOpen={() => lightbox.open(i)}
            label={`Open ${itemLabel(item, i, items.length)}`}
            className="overflow-hidden rounded border border-line"
          >
            <Pic
              src={item.src}
              alt={item.alt}
              width={900}
              height={columns ? 506 : 1200}
              sizes="(max-width: 640px) 50vw, 33vw"
              className="aspect-[4/3] w-full object-cover"
            />
          </ZoomTrigger>
          {item.caption && (
            <figcaption className="mt-1.5 font-hand text-base text-faint">{item.caption}</figcaption>
          )}
        </figure>
      ))}

      <Lightbox
        items={items}
        index={lightbox.index}
        onClose={lightbox.close}
        onIndex={lightbox.setIndex}
      />
    </div>
  );
}
