import { createHash } from "crypto";

/**
 * Server-only Cloudinary helpers (signed upload / destroy).
 * Never import from client components.
 */

export const CLOUDINARY = {
  cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "",
  apiKey: process.env.CLOUDINARY_API_KEY ?? "",
  apiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
};

export const cloudinaryServerConfigured = Boolean(
  CLOUDINARY.cloudName && CLOUDINARY.apiKey && CLOUDINARY.apiSecret
);

/** Cloudinary signature: sha1 of sorted params + api_secret. */
export function signParams(params: Record<string, string | number>) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + CLOUDINARY.apiSecret).digest("hex");
}

/** Delete an asset from Cloudinary (used when removing media in the CMS). */
export async function destroyAsset(publicId: string, resourceType: "image" | "raw" = "image") {
  if (!cloudinaryServerConfigured) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp });
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY.apiKey,
    signature,
  });
  await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${resourceType}/destroy`,
    { method: "POST", body }
  );
}
