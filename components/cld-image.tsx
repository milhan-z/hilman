import Image from "next/image";
import { isCloudinaryDelivery, mediaSrc } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

/**
 * Media image — accepts a Cloudinary public_id or an absolute URL (mock content).
 * Renders nothing if the source can't be resolved (e.g. Cloudinary not configured).
 *
 * Cloudinary images get a responsive srcset served by Cloudinary itself (see
 * lib/cloudinary-loader.ts). Any other URL is shown as it is: there is no
 * second optimiser to send it through any more, and a thumbnail pasted from
 * elsewhere is small already.
 */
export function Pic({
  src,
  alt,
  width = 1600,
  height = 1000,
  sizes = "(max-width: 768px) 100vw, 768px",
  className,
  priority = false,
  loading,
  fetchPriority,
  fill = false,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  /** The image is likely the largest thing on first screen: fetch it first. */
  priority?: boolean;
  /**
   * "eager": fetch it as soon as the HTML names it, without the preload that
   * `priority` adds. For an image that is on the first screen at some widths
   * and below it at others: the browser still ranks it by where it lands.
   */
  loading?: "eager" | "lazy";
  /**
   * "high": ask for it ahead of the page's other images and scripts. For the
   * one image that is the page's LCP at every width, with loading="eager" —
   * what Next's docs recommend over `priority`'s preload.
   */
  fetchPriority?: "high" | "low" | "auto";
  fill?: boolean;
}) {
  const resolved = mediaSrc(src, { width: fill ? 1600 : width });
  if (!resolved) return null;
  const unoptimized = !isCloudinaryDelivery(resolved);
  if (fill) {
    return (
      <Image
        src={resolved}
        alt={alt}
        fill
        sizes={sizes}
        preload={priority}
        unoptimized={unoptimized}
        className={cn("object-cover", className)}
      />
    );
  }
  return (
    <Image
      src={resolved}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      preload={priority}
      loading={priority ? undefined : loading}
      fetchPriority={fetchPriority}
      unoptimized={unoptimized}
      className={className}
    />
  );
}
