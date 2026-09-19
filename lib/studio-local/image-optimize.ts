"use client";

/**
 * Turning a phone photograph into something worth storing and uploading.
 *
 * The decisions all live in media-policy.ts; this module is the half that
 * needs a decoder and a canvas. It measures the source, asks the policy what
 * to do, carries it out, and then lets the policy judge the result — a
 * candidate that did not come back materially smaller is thrown away and the
 * original is kept.
 *
 * ── three things worth knowing ──
 *
 * **Orientation is applied, not carried.** A photo taken sideways stores its
 * rotation in EXIF. Re-encoding through a canvas writes the pixels the right
 * way up and drops the tag, which is what we want — but only if the decode
 * asked for it, so `imageOrientation: "from-image"` is not optional here. Get
 * that wrong and every portrait photo from an iPhone lands on its side.
 *
 * **Alpha is measured, not assumed.** A PNG *may* have transparency; most
 * screenshots do not. Assuming it does means every screenshot is re-encoded as
 * a lossless PNG and stays enormous. Assuming it does not means a logo gets
 * flattened onto black, which is unrecoverable. So we look — at a downscaled
 * copy, because scanning 12 megapixels of RGBA on a phone to answer a yes/no
 * question is its own kind of mistake.
 *
 * **Metadata leaves.** Canvas re-encoding carries no EXIF, which means no
 * camera serial and no GPS coordinates ride along with a photograph published
 * on a public site. That is a side effect of the technique, but it is a
 * welcome one and worth stating so nobody "fixes" it later.
 */

import {
  keepCandidate,
  planImage,
  type ImageEncoderCaps,
  type ImageFacts,
} from "./media-policy";
import { replaced, untouched, type OptimizeOutcome, type ProgressFn } from "./media-optimize";

/** Types that can carry transparency, and so are worth probing for it. */
const MAYBE_ALPHA = new Set(["image/png", "image/gif", "image/webp", "image/avif"]);

/** Longest edge of the throwaway canvas used to answer "is anything transparent?". */
const ALPHA_PROBE_EDGE = 256;

let webpSupport: Promise<boolean> | null = null;

/**
 * Whether this browser can *write* WebP from a canvas.
 *
 * Reading WebP and writing it are different capabilities, and the one that
 * matters here is writing. Probed once and cached: the answer cannot change
 * within a session, and the probe allocates a canvas.
 */
export function canEncodeWebp(): Promise<boolean> {
  if (webpSupport) return webpSupport;
  webpSupport = (async () => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.9)
      );
      return blob?.type === "image/webp";
    } catch {
      return false;
    }
  })();
  return webpSupport;
}

/**
 * Decodes the file, respecting the orientation tag.
 *
 * The second attempt exists because `imageOrientation` is an option some
 * engines reject outright rather than ignore. Losing the orientation is worse
 * than nothing but far better than losing the decode.
 */
async function decode(file: File): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    try {
      return await createImageBitmap(file);
    } catch {
      return null;
    }
  }
}

/**
 * Looks for any pixel that is not fully opaque, on a small copy of the image.
 *
 * Downscaling averages alpha rather than discarding it, so a transparent
 * region of any meaningful size survives into the probe. A single stray
 * translucent pixel in a 12 MP image might not — and that is an acceptable
 * trade for not allocating fifty megabytes on a phone to find it.
 */
function hasTransparency(bitmap: ImageBitmap): boolean {
  try {
    const scale = Math.min(1, ALPHA_PROBE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return true;

    ctx.drawImage(bitmap, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    // A tainted or unreadable canvas tells us nothing, so assume the careful
    // answer: treat it as transparent and stay lossless.
    return true;
  }
}

/** Measures everything the policy needs to decide. */
export async function inspectImage(
  file: File,
  bitmap: ImageBitmap | null
): Promise<ImageFacts> {
  const type = (file.type || "").toLowerCase();
  const couldHaveAlpha = MAYBE_ALPHA.has(type);
  return {
    bytes: file.size,
    width: bitmap?.width ?? 0,
    height: bitmap?.height ?? 0,
    type,
    hasAlpha: couldHaveAlpha && bitmap ? hasTransparency(bitmap) : false,
  };
}

function renameFor(name: string, outputType: string): string {
  const ext = outputType === "image/webp" ? "webp" : outputType === "image/png" ? "png" : "jpg";
  const base = name.replace(/\.[^.]+$/, "") || "photo";
  return `${base}.${ext}`;
}

async function encode(
  bitmap: ImageBitmap,
  width: number,
  height: number,
  outputType: string,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Browsers vary in how they downsample; asking for the good one costs
  // nothing when it is ignored and avoids visible aliasing when it is not.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outputType, quality)
  );

  // Free the backing store on engines that hold onto it — a phone running
  // through a multi-select needs this more than a desktop does.
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

/**
 * The image half of the ingest pipeline.
 *
 * Never throws for an image reason: every failure returns the original, and
 * whether that original is acceptable is a question for the caller's existing
 * size and quota checks.
 */
export async function optimizeImage(
  file: File,
  onProgress?: ProgressFn
): Promise<OptimizeOutcome> {
  onProgress?.({ phase: "inspecting" });

  const bitmap = await decode(file);
  if (!bitmap) return untouched(file, "undecodable");

  try {
    const facts = await inspectImage(file, bitmap);
    const caps: ImageEncoderCaps = { webp: await canEncodeWebp() };
    const plan = planImage(facts, caps);

    if (!plan.optimize) {
      return untouched(file, plan.reason, {
        originalWidth: facts.width,
        originalHeight: facts.height,
      });
    }

    onProgress?.({ phase: "optimizing" });
    const blob = await encode(bitmap, plan.width, plan.height, plan.outputType, plan.quality);

    // The encoder can decline the type entirely and hand back a PNG, or hand
    // back nothing at all. Either way the original is the safe answer.
    if (!blob || blob.size === 0) {
      return untouched(file, "encode-failed", {
        originalWidth: facts.width,
        originalHeight: facts.height,
      });
    }

    onProgress?.({ phase: "validating" });
    if (!keepCandidate(file.size, blob.size, plan.resize)) {
      return untouched(file, "not-worth-it", {
        originalWidth: facts.width,
        originalHeight: facts.height,
      });
    }

    const candidate = new File([blob], renameFor(file.name || "photo", blob.type), {
      type: blob.type,
      lastModified: Date.now(),
    });

    return replaced(file, candidate, {
      originalWidth: facts.width,
      originalHeight: facts.height,
      finalWidth: plan.width,
      finalHeight: plan.height,
    });
  } catch {
    return untouched(file, "error");
  } finally {
    bitmap.close?.();
  }
}
