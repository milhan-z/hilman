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

export function fileSrc(publicIdOrUrl: string | null | undefined) {
  if (!publicIdOrUrl) return null;
  if (/^https?:\/\//.test(publicIdOrUrl)) return publicIdOrUrl;
  if (!CLOUD_NAME) return null;
  return `https://res.cloudinary.com/${CLOUD_NAME}/raw/upload/${publicIdOrUrl}`;
}
