"use client";

/**
 * The shared shape of local media optimization, and the one entry point the
 * ingest boundary calls.
 *
 * Every file that becomes a Blob in IndexedDB goes through `optimizeForIngest`
 * first, whether it came from the camera, the single-file picker, or the
 * multi-photo sheet. That is the whole point of putting it here rather than in
 * a component: there is no route into local storage that skips it, and a
 * future caller gets the behaviour for free instead of having to remember it.
 *
 * ── what this is allowed to do ──
 *
 * Produce a *different, smaller* file to store and upload. That is all. It
 * does not decide whether a file is acceptable (clip-check.ts does), it does
 * not touch the placeholder scheme, it does not know what Cloudinary or R2
 * are, and it never talks to the network — which is what keeps a photograph
 * taken in airplane mode working exactly as it did before.
 *
 * ── what it does when it fails ──
 *
 * Hands back the original. An optimizer that can lose a photograph is worse
 * than no optimizer, so every failure path here is "keep what we were given"
 * and let the caller's existing size and quota rules decide whether that
 * original was acceptable in the first place.
 */

import { MAX_SOURCE_CLIP_BYTES } from "./media-policy";

/* ── progress ─────────────────────────────────────────────── */

export type IngestPhase =
  | "inspecting"
  | "optimizing"
  | "validating"
  | "storing";

export interface IngestProgress {
  phase: IngestPhase;
  /** 0 to 1 within the phase, when the work can actually report it. */
  ratio?: number;
}

/**
 * Deliberately a plain callback rather than anything React-shaped: the
 * optimizer is called from plain functions and must stay importable without
 * dragging a UI framework into the module graph.
 */
export type ProgressFn = (progress: IngestProgress) => void;

/* ── the report ───────────────────────────────────────────── */

export interface MediaReport {
  optimized: boolean;
  originalBytes: number;
  finalBytes: number;
  savedBytes: number;
  /** 0 to 1. Zero when nothing was replaced. */
  savedRatio: number;
  originalWidth?: number;
  originalHeight?: number;
  finalWidth?: number;
  finalHeight?: number;
  durationSeconds?: number;
  originalFps?: number | null;
  finalFps?: number | null;
  codec?: string | null;
  audioRemoved?: boolean;
  /**
   * Why nothing happened, when nothing happened. Short and machine-readable —
   * the UI never shows this, it is for tests and for the console.
   */
  skipped?: string;
}

export interface OptimizeOutcome {
  /** The file to actually store. The original when nothing was worth doing. */
  file: File;
  report: MediaReport;
}

/** A report for the cases where the original passes through untouched. */
export function untouched(file: File, skipped: string, extra: Partial<MediaReport> = {}): OptimizeOutcome {
  return {
    file,
    report: {
      optimized: false,
      originalBytes: file.size,
      finalBytes: file.size,
      savedBytes: 0,
      savedRatio: 0,
      skipped,
      ...extra,
    },
  };
}

/** A report for a candidate that won its place. */
export function replaced(
  original: File,
  candidate: File,
  extra: Partial<MediaReport> = {}
): OptimizeOutcome {
  const savedBytes = original.size - candidate.size;
  return {
    file: candidate,
    report: {
      optimized: true,
      originalBytes: original.size,
      finalBytes: candidate.size,
      savedBytes,
      savedRatio: original.size > 0 ? savedBytes / original.size : 0,
      ...extra,
    },
  };
}

/* ── the one entry point ──────────────────────────────────── */

export class MediaTooLargeError extends Error {}

/**
 * Optimize a file on its way into local storage.
 *
 * `kind` is the same discriminator the rest of the local media system already
 * carries, so this does not introduce a second notion of what a file is.
 *
 * Throws `MediaTooLargeError` only for a source too big to process safely on
 * a phone — everything else that goes wrong falls back to the original file.
 */
export async function optimizeForIngest(
  file: File,
  kind: "image" | "loop-clip",
  onProgress?: ProgressFn
): Promise<OptimizeOutcome> {
  if (kind === "loop-clip") {
    if (file.size > MAX_SOURCE_CLIP_BYTES) {
      throw new MediaTooLargeError(
        "Studio can't safely process a clip this large on this phone. Trim it first and try again."
      );
    }
    // Loaded only when a clip is actually being processed — see the comment
    // in clip-optimize.ts about keeping the encoder off the startup path.
    const { optimizeClip } = await import("./clip-optimize");
    return optimizeClip(file, onProgress);
  }

  const { optimizeImage } = await import("./image-optimize");
  return optimizeImage(file, onProgress);
}
