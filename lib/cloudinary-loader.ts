"use client";

import { DELIVERY_URL } from "./cloudinary";

/**
 * next/image's loader, pointed straight at Cloudinary.
 *
 * Every photograph on the site is already a Cloudinary delivery URL — see
 * mediaSrc() in lib/cloudinary.ts — and Cloudinary resizes, picks AVIF/WebP
 * for the browser asking, and caches at its own edge. The default loader put
 * Vercel's image optimiser in front of that anyway: each size in the srcset
 * was a request to /_next/image, which fetched the 1600px original from
 * Cloudinary and re-encoded it. Two resizing layers, one extra hop on a cold
 * image, and a metered quota spent redoing work the CDN had done.
 *
 * So each width in the srcset now asks Cloudinary for itself, by rewriting
 * the `w_` of the one transform mediaSrc() builds. Anything else — an
 * external thumbnail, a URL somebody pasted — is marked `unoptimized` by
 * <Pic /> and never reaches this function.
 *
 * It must stay a pure function of its arguments: it runs on the server for
 * the HTML and again in the browser, and the two must agree.
 */
export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const match = src.match(DELIVERY_URL);
  // Unreachable through <Pic />, which only hands this function its own URLs.
  // Returned untouched rather than guessed at, so a stray caller still gets
  // the right picture, just not a resized one.
  if (!match) return src;
  const [, base, ownQuality, publicId] = match;
  // `c_limit` never enlarges: a 3840 entry in the srcset of an 1800px
  // original is served at 1800, not upscaled into a bigger, blurrier file.
  return `${base}f_auto,q_${quality ?? ownQuality},w_${width},c_limit/${publicId}`;
}
