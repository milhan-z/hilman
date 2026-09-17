import { Pic } from "../../cld-image";
import { cn } from "@/lib/utils";
import type { GalleryItem } from "./shared";

/**
 * The gallery as it has always looked.
 *
 * This is lifted out of renderer.tsx unchanged — same classes, same sizes,
 * same `aspect-[4/3]` crop — because every gallery already published is a grid
 * and none of them asked to look different. The presentation feature is
 * additive; the thing it is added to has to stay still.
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
  return (
    <div
      className={cn(
        "!max-w-none grid gap-4",
        columns ? "sm:grid-cols-2" : "grid-cols-2 sm:grid-cols-3"
      )}
    >
      {items.map((item, i) => (
        <figure key={i}>
          <div className="overflow-hidden rounded border border-line">
            <Pic
              src={item.src}
              alt={item.alt}
              width={900}
              height={columns ? 506 : 1200}
              sizes="(max-width: 640px) 50vw, 33vw"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          {item.caption && (
            <figcaption className="mt-1.5 font-hand text-base text-faint">{item.caption}</figcaption>
          )}
        </figure>
      ))}
    </div>
  );
}
