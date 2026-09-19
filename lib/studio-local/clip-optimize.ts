"use client";

/**
 * Normalizing a Loop Clip in the browser, with WebCodecs.
 *
 * ── why Mediabunny and not ffmpeg.wasm ──
 *
 * The obvious reach is ffmpeg.wasm, and it is the wrong tool for this
 * product. It ships tens of megabytes of WebAssembly, decodes and encodes
 * entirely in software, and asks a phone to do in its CPU what that phone has
 * dedicated silicon for. On an iPhone doing this inside an installed PWA, that
 * is the difference between a clip that processes in seconds and one that
 * heats the device and gets killed.
 *
 * Mediabunny is a pure-TypeScript media toolkit that drives the browser's own
 * WebCodecs implementation: hardware-backed decode and encode, no wasm blob,
 * no runtime dependencies, and `sideEffects: false` so it tree-shakes. It is
 * imported dynamically — see the comment on `loadMediabunny` — so none of it
 * reaches the public site or the Studio's startup path.
 *
 * ── what it is allowed to change ──
 *
 * Only what the policy asked for. A 1080p, 30 fps, H.264 MP4 of a sensible
 * size is already the right answer and is handed straight back; the encoder
 * is for clips that are oversized, over-fast, bloated, or in a container the
 * public web cannot be trusted with. Audio is dropped when a transcode
 * happens anyway — a Loop Clip is always muted — but is never itself the
 * reason to start one.
 *
 * ── MOV and HEVC ──
 *
 * These used to be refused outright, because there was no way to turn them
 * into something a stranger's browser could play. With an encoder available
 * the answer can be better: if this device can decode the source *and* encode
 * H.264, the clip is normalized into an MP4 and accepted. If either half is
 * missing, the original refusal stands — unchanged, with the same
 * explanation — because accepting a file this device happens to play is not
 * the same as accepting one that works for visitors.
 */

import {
  MAX_CLIP_SECONDS,
  MAX_CLIP_BYTES,
} from "./clip-check";
import { planClip, type ClipFacts } from "./media-policy";
import { replaced, untouched, type OptimizeOutcome, type ProgressFn } from "./media-optimize";

type Mediabunny = typeof import("mediabunny");

let mediabunny: Promise<Mediabunny> | null = null;

/**
 * Loads the encoder, once, and only when a clip actually needs it.
 *
 * A static import would put the whole toolkit into whatever chunk this module
 * lands in, which is the Studio editor — a bundle that has to open quickly on
 * a phone and which, the overwhelming majority of the time, is not about to
 * process a video. The dynamic import keeps it in its own chunk, fetched the
 * first time someone adds a clip that needs work and never otherwise.
 */
function loadMediabunny(): Promise<Mediabunny> {
  mediabunny ??= import("mediabunny");
  return mediabunny;
}

/**
 * One clip at a time, process-wide.
 *
 * Two concurrent WebCodecs pipelines on an iPhone is how a tab gets killed:
 * each one holds decoded frames, and the memory ceiling for a PWA is not
 * generous. Selecting several clips therefore queues rather than races. The
 * chain is kept as a promise rather than a boolean flag so callers never have
 * to poll or retry.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  // Keep the chain alive even when one job rejects, without reporting an
  // unhandled rejection for a result somebody else already received.
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/** Everything the policy needs, read from the file itself. */
export async function inspectClip(file: File): Promise<ClipFacts | null> {
  const { Input, BlobSource, ALL_FORMATS } = await loadMediabunny();

  try {
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;

    const [width, height, duration, codec] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      input.computeDuration(),
      track.getCodecParameterString().catch(() => null),
    ]);

    // Frame rate is deduced from real frame timestamps rather than container
    // metadata, which routinely lies. It is also the most expensive thing
    // here, so a failure to work it out is not fatal — the policy treats null
    // as "leave the frame rate alone".
    let frameRate: number | null = null;
    try {
      const metrics = await track.computeFrameRateMetrics();
      const guess = metrics.bestGuessFrameRate;
      if (Number.isFinite(guess) && guess > 0) frameRate = guess;
    } catch {
      frameRate = null;
    }

    return {
      bytes: file.size,
      width,
      height,
      durationSeconds: duration,
      frameRate,
      codec,
      type: (file.type || "").toLowerCase(),
    };
  } catch {
    // Unreadable by the demuxer. Not an error here: the caller falls back to
    // checkClipFile(), which produces the right sentence for the author.
    return null;
  }
}

/**
 * The clip half of the ingest pipeline.
 *
 * Never throws: every failure hands back the original, and `checkClipFile()`
 * then decides whether that original is acceptable. That ordering is what
 * keeps the existing refusal messages intact when transcoding is unavailable.
 */
export async function optimizeClip(
  file: File,
  onProgress?: ProgressFn
): Promise<OptimizeOutcome> {
  onProgress?.({ phase: "inspecting" });

  const facts = await inspectClip(file).catch(() => null);
  if (!facts) return untouched(file, "unreadable");

  // Too long to be a Loop Clip at all. Transcoding it would be a minute of
  // battery spent on something checkClipFile() is about to refuse anyway.
  if (facts.durationSeconds > MAX_CLIP_SECONDS) {
    return untouched(file, "too-long", { durationSeconds: facts.durationSeconds });
  }

  const plan = planClip(facts);
  const base: Partial<MediaReportExtras> = {
    originalWidth: facts.width,
    originalHeight: facts.height,
    durationSeconds: facts.durationSeconds,
    originalFps: facts.frameRate,
    codec: facts.codec,
  };

  if (!plan.transcode) return untouched(file, "within-budget", base);

  const { canEncodeVideo } = await loadMediabunny();
  const encodable = await canEncodeVideo("avc", {
    width: plan.width,
    height: plan.height,
  }).catch(() => false);

  // No H.264 encoder here. Hand the original back unchanged so the existing
  // container check gives the author the explanation it always did.
  if (!encodable) return untouched(file, "no-encoder", base);

  try {
    const candidate = await serialize(() => transcode(file, plan, onProgress));
    if (!candidate || candidate.size === 0) return untouched(file, "encode-failed", base);

    // A transcode that produced something bigger is a transcode that should
    // not have happened — unless the point was to change container or codec,
    // where the new file is the only publishable one.
    const structural =
      plan.reasons.includes("container") || plan.reasons.includes("codec");
    if (!structural && candidate.size >= file.size) {
      return untouched(file, "not-worth-it", base);
    }

    // The server enforces this too, but refusing here means the author is
    // told now rather than after a long upload.
    if (candidate.size > MAX_CLIP_BYTES) {
      return untouched(file, "still-too-large", base);
    }

    return replaced(file, candidate, {
      ...base,
      finalWidth: plan.width,
      finalHeight: plan.height,
      finalFps: plan.frameRate ?? facts.frameRate,
      audioRemoved: true,
    });
  } catch {
    return untouched(file, "error", base);
  }
}

/** The fields optimizeClip contributes to a MediaReport. */
interface MediaReportExtras {
  originalWidth: number;
  originalHeight: number;
  durationSeconds: number;
  originalFps: number | null;
  codec: string | null;
}

async function transcode(
  file: File,
  plan: ReturnType<typeof planClip>,
  onProgress?: ProgressFn
): Promise<File | null> {
  const { Input, Output, Conversion, BlobSource, BufferTarget, Mp4OutputFormat, ALL_FORMATS } =
    await loadMediabunny();

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });

  const conversion = await Conversion.init({
    input,
    output,
    video: {
      width: plan.width,
      height: plan.height,
      // `contain` rather than `cover`: a Loop Clip must never be silently
      // cropped on its way in. The block decides how it is framed.
      fit: "contain",
      ...(plan.frameRate !== null ? { frameRate: plan.frameRate } : {}),
    },
    // Always muted on the public site, so the track is dead weight in the
    // file and in the upload.
    audio: { discard: true },
  });

  if (!conversion.isValid) return null;

  onProgress?.({ phase: "optimizing", ratio: 0 });
  conversion.onProgress = (ratio: number) => {
    onProgress?.({ phase: "optimizing", ratio });
  };

  await conversion.execute();
  onProgress?.({ phase: "validating" });

  const buffer = output.target.buffer;
  if (!buffer) return null;

  const base = (file.name || "clip").replace(/\.[^.]+$/, "") || "clip";
  return new File([buffer], `${base}.mp4`, {
    type: "video/mp4",
    lastModified: Date.now(),
  });
}
