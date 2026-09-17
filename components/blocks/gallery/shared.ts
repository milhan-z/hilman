/**
 * One gallery item, in the shape every layout reads.
 *
 * The block's stored items are loose — `public_id` or `src`, `alt` and
 * `caption` both optional — and four layouts each doing that normalisation
 * slightly differently is four places for an undefined alt to leak into the
 * page. So it happens once, here, and the layouts take a settled shape.
 */

export interface GalleryItem {
  /** A Cloudinary public_id or an absolute URL — whatever <Pic /> accepts. */
  src: string;
  alt: string;
  caption?: string;
}

export function galleryItems(data: Record<string, any> | null | undefined): GalleryItem[] {
  const raw = Array.isArray(data?.items) ? data!.items : [];
  return raw
    .map((item: any) => ({
      src: String(item?.public_id ?? item?.src ?? ""),
      alt: typeof item?.alt === "string" ? item.alt : "",
      caption: typeof item?.caption === "string" && item.caption.trim() ? item.caption : undefined,
    }))
    .filter((item: GalleryItem) => item.src.length > 0);
}

/**
 * What a control announces for an item.
 *
 * Caption first, then alt, then a position — a button called "Image" five
 * times is a list of nothing, and the position is at least true.
 */
export const itemLabel = (item: GalleryItem, index: number, total: number): string =>
  item.caption || item.alt || `Image ${index + 1} of ${total}`;
