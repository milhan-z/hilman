import Image from "next/image";
import { mediaSrc } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

/**
 * Media image — accepts a Cloudinary public_id or an absolute URL (mock content).
 * Renders nothing if the source can't be resolved (e.g. Cloudinary not configured).
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
  const resolved = mediaSrc(src, { width: fill ? 1600 : width });
  if (!resolved) return null;
  if (fill) {
    return (
      <Image
        src={resolved}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
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
      priority={priority}
      className={className}
    />
  );
}
