/**
 * What is worth optimizing, and how much — decided without touching a canvas,
 * a decoder, or the DOM.
 *
 * This module is deliberately pure. Every function takes facts that some other
 * module measured and returns a plan that some other module carries out, which
 * is what lets the thresholds below be tested against real numbers in Node
 * rather than argued about. The DOM half lives in image-optimize.ts and
 * clip-optimize.ts; the orchestration lives in media-optimize.ts.
 *
 * ── the shape of the decision ──
 *
 * The goal is not "make every file smaller". It is "spend bytes where they buy
 * something". Three ideas carry most of the weight:
 *
 *  1. **Never upscale, never re-encode for nothing.** A 1800×1200 photo at
 *     600 KB is already a reasonable thing to store and send. Running it
 *     through a lossy encoder again costs quality and saves almost nothing —
 *     that is generational loss bought with CPU.
 *
 *  2. **A candidate has to earn its place.** Optimization produces a
 *     *candidate*, not a replacement. It is only kept if the pixels genuinely
 *     needed resizing, or if it came back materially smaller. "Materially" is
 *     a real threshold, not zero, so a 2% win never justifies a re-encode.
 *
 *  3. **Screenshots are not photographs.** Small text and hard edges are what
 *     JPEG is worst at, and a portfolio full of soft, artifacted UI captures
 *     is a worse outcome than a portfolio of slightly larger clean ones.
 *
 * Cloudinary still does delivery-time optimization for images, and that is
 * unchanged. What happens here is about the *original* — the bytes that sit in
 * IndexedDB on a phone and then cross a mobile connection. Those are the ones
 * this can actually save.
 */

/* ── images ───────────────────────────────────────────────── */

/**
 * The longest edge worth storing.
 *
 * A modern phone shoots around 4032 px wide; a 5K display shows a full-bleed
 * image at about 2560 CSS px, or roughly 3200 device px on the panels that
 * matter. Past that the extra pixels are paid for on upload and never seen.
 */
export const MAX_IMAGE_LONG_EDGE = 3200;

/**
 * Below this, an image that is already the right size is left completely
 * alone. It is roughly where a well-exported photograph stops being worth the
 * quality risk of another lossy pass.
 */
export const RECOMPRESS_FLOOR_BYTES = 600 * 1024;

/** Photographic content: gradients and grain, where 0.9 is visually clean. */
export const PHOTO_QUALITY = 0.9;

/**
 * Screens, diagrams and anything with type in it. Higher, because the failure
 * mode here is legibility rather than a slightly soft sky.
 */
export const GRAPHIC_QUALITY = 0.95;

/**
 * How much smaller a candidate has to be to replace the original.
 *
 * Anything under this is a re-encode that cost quality and bought noise.
 */
export const MIN_SAVING_RATIO = 0.1;

export interface ImageFacts {
  bytes: number;
  width: number;
  height: number;
  /** The source file's MIME type, lowercased. May be empty if the OS gave none. */
  type: string;
  /**
   * Whether the source can carry transparency. Conservative: PNG, GIF and
   * WebP are treated as "may have alpha" unless the caller proved otherwise,
   * because flattening a logo onto black is not a recoverable mistake.
   */
  hasAlpha: boolean;
}

/** What the browser can actually encode, probed once by the DOM layer. */
export interface ImageEncoderCaps {
  webp: boolean;
}

export type ImageReason = "within-budget" | "oversized" | "heavy" | "undecodable";

export interface ImagePlan {
  /** False means "leave the original completely alone". */
  optimize: boolean;
  width: number;
  height: number;
  /** True when the pixel dimensions actually change. */
  resize: boolean;
  outputType: string;
  quality: number;
  /** Why, in a word — for the report, and for tests to assert against. */
  reason: ImageReason;
}

/** Fits width by height inside a square box without ever growing it. */
export function fitWithin(
  width: number,
  height: number,
  longEdge: number
): { width: number; height: number; resized: boolean } {
  const longest = Math.max(width, height);
  if (longest <= longEdge || longest === 0) return { width, height, resized: false };
  const scale = longEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    resized: true,
  };
}

/**
 * Whether this source is the kind of image where soft text would be the
 * noticeable failure.
 *
 * A PNG that a camera did not produce is nearly always a screenshot, an
 * export, or a diagram. It is a heuristic, and it is deliberately biased
 * toward "treat it carefully": being wrong costs a few kilobytes, while being
 * wrong the other way costs legibility.
 */
export function looksGraphic(type: string): boolean {
  const t = type.toLowerCase();
  return t === "image/png" || t === "image/gif" || t === "image/bmp" || t === "image/svg+xml";
}

/**
 * Picks the container to re-encode into.
 *
 * Alpha stays lossless, because the alternative is either flattening it or
 * betting on a lossy encoder to preserve a mask. Everything else prefers WebP
 * when the browser can write it — it beats JPEG at both photographs and text,
 * which is exactly the split this policy cares about — and falls back to JPEG
 * where it cannot.
 */
export function outputTypeFor(facts: ImageFacts, caps: ImageEncoderCaps): string {
  if (facts.hasAlpha) return "image/png";
  if (caps.webp) return "image/webp";
  return "image/jpeg";
}

export function planImage(facts: ImageFacts, caps: ImageEncoderCaps): ImagePlan {
  const quality = looksGraphic(facts.type) ? GRAPHIC_QUALITY : PHOTO_QUALITY;
  const outputType = outputTypeFor(facts, caps);

  // Nothing measurable to work from — the decoder could not read it. Say so
  // rather than guess at dimensions; the caller then keeps the original.
  if (!facts.width || !facts.height) {
    return {
      optimize: false,
      width: facts.width,
      height: facts.height,
      resize: false,
      outputType,
      quality,
      reason: "undecodable",
    };
  }

  const fitted = fitWithin(facts.width, facts.height, MAX_IMAGE_LONG_EDGE);

  // Right size already, and not heavy enough to be worth the quality risk.
  if (!fitted.resized && facts.bytes <= RECOMPRESS_FLOOR_BYTES) {
    return {
      optimize: false,
      width: facts.width,
      height: facts.height,
      resize: false,
      outputType,
      quality,
      reason: "within-budget",
    };
  }

  return {
    optimize: true,
    width: fitted.width,
    height: fitted.height,
    resize: fitted.resized,
    outputType,
    quality,
    reason: fitted.resized ? "oversized" : "heavy",
  };
}

/**
 * The gate a finished candidate has to pass to replace the original.
 *
 * Resizing is its own justification: the whole point was to stop carrying
 * 4032 px around, and the new file is the only one with the right dimensions.
 * A pure re-encode has to prove itself on bytes alone.
 */
export function keepCandidate(
  originalBytes: number,
  candidateBytes: number,
  resized: boolean
): boolean {
  if (candidateBytes <= 0) return false;
  if (candidateBytes >= originalBytes) return false;
  if (resized) return true;
  return candidateBytes <= originalBytes * (1 - MIN_SAVING_RATIO);
}

/* ── loop clips ───────────────────────────────────────────── */

/** The box a clip is fitted into — 1080p, either way up. */
export const MAX_CLIP_LONG_EDGE = 1920;
export const MAX_CLIP_SHORT_EDGE = 1080;

/** Past this a loop is just a video playing fast. */
export const MAX_CLIP_FPS = 30;

/**
 * Frame rates wobble. 30.003 fps is a 30 fps clip, and re-encoding it to
 * "fix" that would be exactly the pointless transcode this policy exists to
 * avoid.
 */
export const FPS_TOLERANCE = 1.5;

/**
 * Bits per pixel per frame, above which a clip is carrying more data than it
 * is showing.
 *
 * A well-encoded H.264 delivery file sits around 0.08 to 0.12. Screen
 * recordings and phone exports routinely come in at 0.3 and above, which is
 * where transcoding buys real megabytes without touching anything anyone can
 * see. The ceiling is set well clear of good encodes so a decent file is never
 * disturbed.
 */
export const MAX_BITS_PER_PIXEL = 0.25;

/**
 * The largest source this is willing to decode on a phone.
 *
 * Not a quality judgement — a memory one. Safari will happily be asked to
 * demux a 600 MB 4K export and will take the tab down with it. Refusing with a
 * sentence is better than a crash that loses the draft underneath.
 */
export const MAX_SOURCE_CLIP_BYTES = 200 * 1024 * 1024;

export interface ClipFacts {
  bytes: number;
  width: number;
  height: number;
  durationSeconds: number;
  /** Measured from frame timestamps, not container metadata. Null when unknown. */
  frameRate: number | null;
  /** A codec string such as avc1.42001f, or null when it could not be read. */
  codec: string | null;
  /** The source file's MIME type, lowercased. */
  type: string;
}

export type ClipReason = "oversized" | "high-fps" | "heavy" | "container" | "codec";

export interface ClipPlan {
  transcode: boolean;
  width: number;
  height: number;
  /** Null means "leave the source frame rate alone". */
  frameRate: number | null;
  /** Machine-readable, so tests assert on causes rather than on prose. */
  reasons: ClipReason[];
}

/** True for an H.264 codec string in any of the shapes a demuxer reports. */
export function isAvc(codec: string | null): boolean {
  if (!codec) return false;
  const c = codec.toLowerCase();
  return c === "avc" || c.startsWith("avc1") || c.startsWith("avc3") || c.startsWith("h264");
}

export function isMp4Container(type: string): boolean {
  const t = type.toLowerCase();
  return t === "video/mp4" || t === "video/x-m4v";
}

/** Bits carried per pixel per frame — the "is this encode bloated" measure. */
export function bitsPerPixel(facts: ClipFacts): number | null {
  const { bytes, width, height, durationSeconds, frameRate } = facts;
  const fps = frameRate ?? MAX_CLIP_FPS;
  const pixels = width * height * fps * durationSeconds;
  if (!Number.isFinite(pixels) || pixels <= 0) return null;
  return (bytes * 8) / pixels;
}

/**
 * Fits a clip into the 1080p box in whichever orientation it already has, so a
 * portrait screen recording stays portrait.
 */
export function fitClip(
  width: number,
  height: number
): { width: number; height: number; resized: boolean } {
  const portrait = height > width;
  const widthCap = portrait ? MAX_CLIP_SHORT_EDGE : MAX_CLIP_LONG_EDGE;
  const heightCap = portrait ? MAX_CLIP_LONG_EDGE : MAX_CLIP_SHORT_EDGE;

  if (width <= 0 || height <= 0) return { width, height, resized: false };

  const scale = Math.min(1, widthCap / width, heightCap / height);
  if (scale >= 1) return { width, height, resized: false };

  // Even dimensions: H.264 chroma subsampling cannot represent odd ones, and
  // encoders either refuse them or silently pad.
  const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height), resized: true };
}

/**
 * Whether this clip is worth putting through an encoder.
 *
 * The bar is deliberately high. A 1080p, 30 fps, H.264 MP4 of a sensible size
 * is already exactly what a Loop Clip should be, and running it through
 * WebCodecs would spend a minute of phone battery to produce a slightly worse
 * file. Audio is *not* a reason on its own — it is dropped when transcoding
 * happens for some other reason, never a cause of one.
 */
export function planClip(facts: ClipFacts): ClipPlan {
  const reasons: ClipReason[] = [];
  const fitted = fitClip(facts.width, facts.height);

  if (fitted.resized) reasons.push("oversized");

  const fps = facts.frameRate;
  const cutFps = fps !== null && fps > MAX_CLIP_FPS + FPS_TOLERANCE;
  if (cutFps) reasons.push("high-fps");

  const bpp = bitsPerPixel(facts);
  if (bpp !== null && bpp > MAX_BITS_PER_PIXEL) reasons.push("heavy");

  if (!isMp4Container(facts.type)) reasons.push("container");

  // Only a reason when the codec was actually readable; an unknown codec in a
  // valid MP4 is not evidence of anything.
  if (facts.codec !== null && !isAvc(facts.codec)) reasons.push("codec");

  return {
    transcode: reasons.length > 0,
    width: fitted.width,
    height: fitted.height,
    frameRate: cutFps ? MAX_CLIP_FPS : null,
    reasons,
  };
}
