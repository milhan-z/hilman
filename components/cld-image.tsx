import Image from "next/image";
import { cloudinaryLoader, isCloudinaryId, mediaSrc } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

/**
 * Media image — accepts a Cloudinary public_id or an absolute URL (mock content).
 * Renders nothing if the source can't be resolved (e.g. Cloudinary not configured).
 *
 * A Cloudinary public_id is served through `cloudinaryLoader`, so the CDN
 * resizes straight to each srcset width. Anything else (mock URLs, YouTube
 * thumbnails) falls back to Next's own optimizer.
 */
export function Pic({
  src,
  alt,
  width = 1600,
  height = 1000,
  sizes = "(max-width: 768px) 100vw, 768px",
  className,
  priority = false,
  fill = false,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  sizes?: string;
  className?: string;
  priority?: boolean;
  fill?: boolean;
}) {
  const viaCloudinary = isCloudinaryId(src);
  // With the loader, `src` stays the raw public_id — the loader builds the URL.
  const resolved = viaCloudinary ? src : mediaSrc(src, { width: fill ? 1600 : width });
  if (!resolved) return null;

  const shared = {
    src: resolved,
    alt,
    sizes,
    priority,
    ...(viaCloudinary ? { loader: cloudinaryLoader } : {}),
    // Anything not needed for the first paint waits until it is near the viewport.
    ...(priority ? {} : { loading: "lazy" as const }),
  };

  if (fill) {
    return <Image {...shared} fill className={cn("object-cover", className)} />;
  }
  return <Image {...shared} width={width} height={height} className={className} />;
}
