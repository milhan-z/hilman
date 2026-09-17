"use client";

/**
 * Whether a video file is safe to ship as a Loop Clip, checked before it ever
 * leaves the phone.
 *
 * There is no free transcoding service, and v1 deliberately does not build
 * one — so the only honest options are "accept a narrow, known-good format"
 * or "silently upload whatever was selected and let a stranger's browser
 * discover it doesn't play." This module is the first option.
 *
 * ── why this can only ever be a best effort ──
 *
 * A `File`'s `.type` reports the *container* MIME type, not the codec inside
 * it. An iPhone set to "Most Compatible" in Settings → Camera → Formats
 * produces H.264 in a `.mov` container; the default "High Efficiency" setting
 * produces HEVC in a `.mov` container. Both report the same
 * `video/quicktime`. There is no way to tell them apart from JS without
 * decoding the file — which is exactly what the second check below does.
 *
 * That check is still only a proxy for the *visitor's* browser, not a
 * guarantee. It runs in whichever browser is doing the uploading — often
 * Safari on the owner's own iPhone, which decodes HEVC natively. A clip that
 * passes there can still fail for a Chrome visitor if it is genuinely HEVC.
 * The container restriction below is what actually carries the weight: an
 * `.mp4` container is never HEVC-only in practice for content produced by an
 * ordinary phone export or screen recording, because nothing offers to wrap
 * HEVC in `.mp4` and call it that on export — HEVC exports name themselves
 * `.mov`. Restricting to `.mp4` is therefore doing more of the real work here
 * than the decode probe is; the probe is a second opinion, not the mechanism.
 */

export interface ClipCheckResult {
  ok: boolean;
  /** Only present when `ok` is false — the sentence to show the author. */
  reason?: string;
  /** Seconds, once known. Used to enforce the length ceiling. */
  duration?: number;
}

/** Deliberately narrow for v1. See the file comment for why this is the check that matters. */
const ALLOWED_TYPE = "video/mp4";
const ALLOWED_EXTENSION = /\.mp4$/i;

/** A "short clip", not a video. Long enough for a real demo, short enough that nobody mistakes it for one. */
export const MAX_CLIP_SECONDS = 60;

/** Matches MAX_CLIP_BYTES in app/api/r2/sign/route.ts. Kept in a comment, not an import — see that file. */
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
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    // A file that is neither decodable nor erroring within 15 seconds is
    // treated as unverifiable — distinct from a genuine decode error.
    const timer = setTimeout(() => finish({ ok: false, reason: "timeout" }), 15000);

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
export async function checkClipFile(file: File): Promise<ClipCheckResult> {
  const looksLikeMp4 = file.type === ALLOWED_TYPE || (!file.type && ALLOWED_EXTENSION.test(file.name));
  if (!looksLikeMp4) {
    const shown = file.type || (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? "unknown format");
    return {
      ok: false,
      reason:
        `Loop Clip only accepts MP4 video for now — this file is ${shown}. ` +
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

  if (typeof document === "undefined") {
    // No DOM to probe with (a test environment, mainly). The container check
    // above already did the check that actually carries weight — see the file
    // comment — so this is a reduced guarantee, not a skipped one.
    return { ok: true };
  }

  const played = await probePlayback(file);
  if (!played.ok) {
    const reason =
      played.reason === "timeout"
        ? "Studio couldn't verify this clip in time. Try again, or re-export it as MP4."
        : "This phone couldn't play that file back, so it likely won't play for visitors either. Try re-exporting it as MP4.";
    return { ok: false, reason };
  }
  if (played.duration > MAX_CLIP_SECONDS) {
    return {
      ok: false,
      reason: `That clip is ${readableSeconds(played.duration)} long. Loop Clip is for short, looping moments — up to ${MAX_CLIP_SECONDS}s. Trim it, or use a YouTube video block for anything longer.`,
      duration: played.duration,
    };
  }

  return { ok: true, duration: played.duration };
}
