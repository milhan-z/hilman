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
  // A photo still stashed on someone's phone has no delivery URL, and building
  // one from the placeholder would put a permanent 404 on the public site.
  // The studio shows these through components/admin/pending-media.tsx instead.
  if (publicIdOrUrl.startsWith("pending:")) return null;
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  if (!CLOUD_NAME) return null;
  const t = ["f_auto", `q_${opts.quality ?? "auto"}`];
  if (opts.width) t.push(`w_${opts.width}`, "c_limit");
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/${t.join(",")}/${publicIdOrUrl}`;
}

/**
 * A delivery URL exactly as mediaSrc() writes it, split into the part before
 * the transform, the quality it asked for, and the public_id after it.
 *
 * lib/cloudinary-loader.ts rewrites only URLs of this shape, and <Pic /> sends
 * only these through it: a Cloudinary URL pasted with transforms of its own
 * (a crop, a face-fill) must keep them, and swapping in a width would not.
 */
export const DELIVERY_URL = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)f_auto,q_([^,/]+),w_\d+,c_limit\/(.+)$/;

export function isCloudinaryDelivery(src: string): boolean {
  return DELIVERY_URL.test(src);
}

export function fileSrc(publicIdOrUrl: string | null | undefined) {
  if (!publicIdOrUrl) return null;
  if (publicIdOrUrl.startsWith("pending:")) return null;
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  if (!CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${CLOUD_NAME}/raw/upload/${publicIdOrUrl}`;
}
