const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

export const cloudinaryConfigured = Boolean(CLOUD_NAME);

/**
 * Build a delivery URL for a Cloudinary public_id with sensible transforms.
 * If `src` is already an absolute URL (mock/seed content), pass it through.
 */
export function mediaSrc(
  publicIdOrUrl: string | null | undefined,
  opts: { width?: number; quality?: string } = {}
) {
  if (!publicIdOrUrl) return null;
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  if (!CLOUD_NAME) return null;
  const t = ["f_auto", `q_${opts.quality ?? "auto"}`];
  if (opts.width) t.push(`w_${opts.width}`, "c_limit");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${t.join(",")}/${publicIdOrUrl}`;
}

/**
 * next/image loader for Cloudinary-hosted media.
 *
 * Without it every image took two hops: Cloudinary resized it, then Next's own
 * optimizer fetched and re-encoded that result. Cloudinary can serve the exact
 * width in the srcset directly, so this hands the resizing to the CDN and skips
 * the second hop — one less round-trip per image, and no server CPU per render.
 */
export function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const transform = ["f_auto", `q_${quality ?? "auto"}`, `w_${width}`, "c_limit"].join(",");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${transform}/${src}`;
}

/** True when this source is a Cloudinary public_id the loader above can serve. */
export function isCloudinaryId(src: string | null | undefined): src is string {
  return Boolean(src && CLOUD_NAME && !/^https?:\/\//.test(src));
}

export function fileSrc(publicIdOrUrl: string | null | undefined) {
  if (!publicIdOrUrl) return null;
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  if (!CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${CLOUD_NAME}/raw/upload/${publicIdOrUrl}`;
}
