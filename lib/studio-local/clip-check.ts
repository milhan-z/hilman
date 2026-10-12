"use client";

/**
 * Whether a video file is safe to ship as a Loop Clip, checked before it ever
 * leaves the phone.
 *
 * MP4 can contain HEVC as well as H.264. Neither a filename nor playback on
 * the author's device establishes the public codec. Read the actual container
 * and video track first; a browser playback probe is an additional check.
 */

import { isAvc } from "./media-policy";

export interface ClipCheckResult {
  ok: boolean;
  /** Only present when `ok` is false — the sentence to show the author. */
  reason?: string;
  /** Seconds, once known. Used to enforce the length ceiling. */
  duration?: number;
}

/** Cheap label checks precede the authoritative container/codec inspection. */
const ALLOWED_TYPE = "video/mp4";
const ALLOWED_EXTENSION = /\.mp4$/i;

/** A "short clip", not a video. Long enough for a real demo, short enough that nobody mistakes it for one. */
export const MAX_CLIP_SECONDS = 60;

/** Matches the loop-clip maxBytes in lib/r2-policy.ts, which the signing route enforces. */
export const MAX_CLIP_BYTES = 50 * 1024 * 1024;

const readableMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const readableSeconds = (seconds: number) => `${Math.round(seconds)}s`;

/**
 * Loads just enough of the file to ask the browser "can you actually play
 * this?" — a hidden, muted `<video>` element, never attached to the page.
 * `loadedmetadata` means yes, and hands back the duration for free;
 * `error` means no, for whatever reason this browser has.
 */
function probePlayback(
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ ok: true; duration: number } | { ok: false; reason: "error" | "timeout" }> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    let settled = false;

    const finish = (
      result: { ok: true; duration: number } | { ok: false; reason: "error" | "timeout" },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", aborted);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    // A file that is neither decodable nor erroring within 15 seconds is
    // treated as unverifiable — distinct from a genuine decode error.
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), 15000);
    const aborted = () => finish({ ok: false, reason: "error" });
    signal?.addEventListener("abort", aborted, { once: true });
    if (signal?.aborted) return aborted();

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish({ ok: true, duration: video.duration || 0 });
    video.onerror = () => finish({ ok: false, reason: "error" });
    video.src = url;
    video.load();
  });
}

/**
 * The full gate a file goes through before `stashMedia()` will keep it as a
 * Loop Clip. Cheap checks first, so an obviously-wrong file (a `.mov`, a
 * 300MB export) never pays for a decode attempt.
 */
export async function checkClipFile(file: File, signal?: AbortSignal): Promise<ClipCheckResult> {
  signal?.throwIfAborted();
  const looksLikeMp4 = file.type === ALLOWED_TYPE || (!file.type && ALLOWED_EXTENSION.test(file.name));
  if (!looksLikeMp4) {
    const shown = file.type || (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "unknown format");
    return {
      ok: false,
      reason:
        `Loop Clip only accepts MP4 video for now — this file is ${shown}. ` +
        `This browser couldn't normalize it to H.264 MP4. ` +
        `On an iPhone, Settings → Camera → Formats → "Most Compatible" exports H.264 video, ` +
        `which most video editors can also save or convert to MP4.`,
    };
  }

  if (file.size > MAX_CLIP_BYTES) {
    return {
      ok: false,
      reason: `That clip is ${readableMB(file.size)}. Loop Clip is for short clips, up to ${readableMB(MAX_CLIP_BYTES)} — trim it or lower the export quality.`,
    };
  }

  // Lazy, shared demuxer: metadata inspection needs no browser encoder or
  // decoder, and runs in Node as well as on the author's phone.
  const { inspectClip } = await import("./clip-optimize");
  const facts = await inspectClip(file, signal, false);
  signal?.throwIfAborted();
  if (!facts || facts.type !== ALLOWED_TYPE || !isAvc(facts.codec)) {
    return {
      ok: false,
      reason: "Loop Clip needs a verified H.264 MP4. This file could not be normalized or verified on this browser. Export it as H.264 MP4, or try a browser with H.264 encoding support.",
    };
  }
  if (!Number.isFinite(facts.durationSeconds) || facts.durationSeconds <= 0) {
    return { ok: false, reason: "Studio couldn't read this clip's length. Re-export it as H.264 MP4 and try again." };
  }
  if (facts.durationSeconds > MAX_CLIP_SECONDS) return tooLong(facts.durationSeconds);
  if (typeof document === "undefined") return { ok: true, duration: facts.durationSeconds };

  const played = await probePlayback(file, signal);
  signal?.throwIfAborted();
  if (!played.ok) {
    const reason =
      played.reason === "timeout"
        ? "Studio couldn't verify this clip in time. Try again, or re-export it as MP4."
        : "This phone couldn't play that file back, so it likely won't play for visitors either. Try re-exporting it as MP4.";
    return { ok: false, reason };
  }
  if (played.duration > MAX_CLIP_SECONDS) {
    return tooLong(played.duration);
  }

  return { ok: true, duration: played.duration };
}

function tooLong(duration: number): ClipCheckResult {
  return {
    ok: false,
    reason: `That clip is ${readableSeconds(duration)} long. Loop Clip is for short, looping moments — up to ${MAX_CLIP_SECONDS}s. Trim it, or use a YouTube video block for anything longer.`,
    duration,
  };
}
