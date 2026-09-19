import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  GRAPHIC_QUALITY,
  MAX_BITS_PER_PIXEL,
  MAX_CLIP_FPS,
  MAX_CLIP_LONG_EDGE,
  MAX_CLIP_SHORT_EDGE,
  MAX_IMAGE_LONG_EDGE,
  MAX_SOURCE_CLIP_BYTES,
  MIN_SAVING_RATIO,
  PHOTO_QUALITY,
  RECOMPRESS_FLOOR_BYTES,
  bitsPerPixel,
  fitClip,
  fitWithin,
  isAvc,
  isMp4Container,
  keepCandidate,
  looksGraphic,
  outputTypeFor,
  planClip,
  planImage,
  type ClipFacts,
  type ImageFacts,
} from "../lib/studio-local/media-policy";
import { ingestLabel, savingNote } from "../lib/studio-local/ingest-status";
import { MAX_CLIP_BYTES, MAX_CLIP_SECONDS } from "../lib/studio-local/clip-check";

/**
 * Smart media ingest: inspect, decide, optimize only if useful, validate.
 *
 * The decisions all live in media-policy.ts precisely so they can be tested
 * here, against numbers, without a canvas or a WebCodecs implementation. What
 * this file defends is the *judgement* — that a good file is left alone, that
 * a candidate has to earn its place, and that nothing is ever made larger or
 * softer for no reason.
 *
 * The parts that genuinely need a browser (canvas encoding, WebCodecs
 * transcoding) are verified separately and are listed in the report as
 * requiring a real device.
 */

const photo = (over: Partial<ImageFacts> = {}): ImageFacts => ({
  bytes: 4 * 1024 * 1024,
  width: 4032,
  height: 3024,
  type: "image/jpeg",
  hasAlpha: false,
  ...over,
});

const CAPS = { webp: true };
const NO_WEBP = { webp: false };

/* ── images: leave good files alone ───────────────────────── */

test("a reasonable photograph is not touched at all", () => {
  // The example from the brief: 1800x1200, 600 KB. Already the right size and
  // already small; re-encoding it would cost quality and save nothing.
  const plan = planImage(photo({ width: 1800, height: 1200, bytes: 600 * 1024 }), CAPS);
  assert.equal(plan.optimize, false);
  assert.equal(plan.reason, "within-budget");
});

test("a large phone photograph is resized", () => {
  const plan = planImage(photo(), CAPS);
  assert.equal(plan.optimize, true);
  assert.equal(plan.reason, "oversized");
  assert.equal(Math.max(plan.width, plan.height), MAX_IMAGE_LONG_EDGE);
  assert.equal(plan.resize, true);
});

test("a correctly sized but very heavy image is re-encoded without resizing", () => {
  const plan = planImage(photo({ width: 2000, height: 1500, bytes: 9 * 1024 * 1024 }), CAPS);
  assert.equal(plan.optimize, true);
  assert.equal(plan.reason, "heavy");
  assert.equal(plan.resize, false);
  assert.equal(plan.width, 2000, "the pixels are left where they were");
});

test("nothing is ever upscaled", () => {
  for (const [w, h] of [
    [800, 600],
    [100, 3000],
    [3200, 1],
    [1, 1],
  ]) {
    const fitted = fitWithin(w, h, MAX_IMAGE_LONG_EDGE);
    assert.ok(fitted.width <= w && fitted.height <= h, `${w}x${h} grew`);
  }
});

test("resizing preserves the aspect ratio", () => {
  const fitted = fitWithin(4032, 3024, MAX_IMAGE_LONG_EDGE);
  const before = 4032 / 3024;
  const after = fitted.width / fitted.height;
  assert.ok(Math.abs(before - after) < 0.01, `${before} became ${after}`);
});

test("an undecodable image asks for nothing to be done", () => {
  const plan = planImage(photo({ width: 0, height: 0 }), CAPS);
  assert.equal(plan.optimize, false);
  assert.equal(plan.reason, "undecodable");
});

/* ── images: transparency and text ────────────────────────── */

test("transparency is kept lossless, never flattened", () => {
  const type = outputTypeFor(photo({ hasAlpha: true, type: "image/png" }), CAPS);
  assert.equal(type, "image/png", "alpha must not go through a lossy encoder");
});

test("an opaque image prefers WebP, and falls back to JPEG without it", () => {
  assert.equal(outputTypeFor(photo(), CAPS), "image/webp");
  assert.equal(outputTypeFor(photo(), NO_WEBP), "image/jpeg");
});

test("screenshots are encoded more carefully than photographs", () => {
  // Small text and hard edges are exactly what a lossy encoder is worst at.
  const screenshot = planImage(photo({ type: "image/png", bytes: 8 * 1024 * 1024 }), CAPS);
  const photograph = planImage(photo({ type: "image/jpeg", bytes: 8 * 1024 * 1024 }), CAPS);
  assert.equal(screenshot.quality, GRAPHIC_QUALITY);
  assert.equal(photograph.quality, PHOTO_QUALITY);
  assert.ok(screenshot.quality > photograph.quality);
});

test("the graphic heuristic covers the formats a camera does not produce", () => {
  assert.equal(looksGraphic("image/png"), true);
  assert.equal(looksGraphic("image/gif"), true);
  assert.equal(looksGraphic("image/jpeg"), false);
  assert.equal(looksGraphic("image/heic"), false);
});

/* ── images: a candidate has to earn its place ────────────── */

test("a candidate that is only trivially smaller is thrown away", () => {
  // 3% saved is not worth a generation of loss.
  assert.equal(keepCandidate(1_000_000, 970_000, false), false);
});

test("a candidate that is materially smaller is kept", () => {
  assert.equal(keepCandidate(1_000_000, 500_000, false), true);
  assert.equal(keepCandidate(1_000_000, 1_000_000 * (1 - MIN_SAVING_RATIO), false), true);
});

test("a resize justifies itself, even when the bytes barely move", () => {
  // The whole point was to stop carrying 4032px around; the resized file is
  // the only one with the right dimensions.
  assert.equal(keepCandidate(1_000_000, 990_000, true), true);
});

test("a candidate that came back bigger is never kept", () => {
  assert.equal(keepCandidate(500_000, 500_001, true), false);
  assert.equal(keepCandidate(500_000, 900_000, true), false);
});

test("an empty candidate is never kept", () => {
  assert.equal(keepCandidate(500_000, 0, true), false);
});

/* ── clips: leave good clips alone ────────────────────────── */

const clip = (over: Partial<ClipFacts> = {}): ClipFacts => ({
  bytes: 8 * 1024 * 1024,
  width: 1920,
  height: 1080,
  durationSeconds: 10,
  frameRate: 30,
  codec: "avc1.42001f",
  type: "video/mp4",
  ...over,
});

test("a good 1080p 30fps H.264 MP4 is left completely alone", () => {
  // The example from the brief. Transcoding this would spend a minute of
  // phone battery to produce a slightly worse file.
  const plan = planClip(clip());
  assert.equal(plan.transcode, false);
  assert.deepEqual(plan.reasons, []);
});

test("a 4K clip is brought down to 1080p", () => {
  const plan = planClip(clip({ width: 3840, height: 2160, bytes: 40 * 1024 * 1024 }));
  assert.equal(plan.transcode, true);
  assert.ok(plan.reasons.includes("oversized"));
  assert.equal(plan.width, MAX_CLIP_LONG_EDGE);
  assert.equal(plan.height, MAX_CLIP_SHORT_EDGE);
});

test("a portrait clip stays portrait", () => {
  const plan = planClip(clip({ width: 2160, height: 3840, bytes: 40 * 1024 * 1024 }));
  assert.ok(plan.height > plan.width, "a phone recording must not be turned on its side");
  assert.ok(plan.width <= MAX_CLIP_SHORT_EDGE && plan.height <= MAX_CLIP_LONG_EDGE);
});

test("clip dimensions always come out even", () => {
  // H.264 chroma subsampling cannot represent odd dimensions; encoders either
  // refuse them or silently pad.
  for (const [w, h] of [
    [3841, 2161],
    [2999, 1687],
    [1921, 1081],
  ]) {
    const fitted = fitClip(w, h);
    assert.equal(fitted.width % 2, 0, `${w}x${h} -> odd width`);
    assert.equal(fitted.height % 2, 0, `${w}x${h} -> odd height`);
  }
});

test("a 60fps clip is brought down to 30", () => {
  const plan = planClip(clip({ frameRate: 60, bytes: 16 * 1024 * 1024 }));
  assert.equal(plan.transcode, true);
  assert.ok(plan.reasons.includes("high-fps"));
  assert.equal(plan.frameRate, MAX_CLIP_FPS);
});

test("a frame rate that merely wobbles is not a reason to re-encode", () => {
  // 30.003fps is a 30fps clip. Re-encoding to "fix" that is the pointless
  // transcode this policy exists to avoid.
  const plan = planClip(clip({ frameRate: 30.003 }));
  assert.equal(plan.transcode, false);
  assert.equal(plan.frameRate, null, "and the source rate is left alone");
});

test("a bloated encode is re-encoded even at the right size and rate", () => {
  // Same pixels, same duration, four times the data.
  const plan = planClip(clip({ bytes: 32 * 1024 * 1024 }));
  assert.equal(plan.transcode, true);
  assert.ok(plan.reasons.includes("heavy"));
});

test("the bloat measure matches what good H.264 actually looks like", () => {
  const good = bitsPerPixel(clip());
  assert.ok(good !== null && good < MAX_BITS_PER_PIXEL, `${good} should be under the ceiling`);
  const bad = bitsPerPixel(clip({ bytes: 32 * 1024 * 1024 }));
  assert.ok(bad !== null && bad > MAX_BITS_PER_PIXEL, `${bad} should be over it`);
});

test("a zero-length clip does not divide by zero", () => {
  assert.equal(bitsPerPixel(clip({ durationSeconds: 0 })), null);
  assert.equal(bitsPerPixel(clip({ width: 0, height: 0 })), null);
});

/* ── clips: containers and codecs ─────────────────────────── */

test("a MOV container is a reason to normalize", () => {
  const plan = planClip(clip({ type: "video/quicktime" }));
  assert.equal(plan.transcode, true);
  assert.ok(plan.reasons.includes("container"));
});

test("HEVC is a reason to normalize, whatever container it arrived in", () => {
  const plan = planClip(clip({ codec: "hvc1.1.6.L93.B0" }));
  assert.equal(plan.transcode, true);
  assert.ok(plan.reasons.includes("codec"));
});

test("an unreadable codec in a valid MP4 is not evidence of anything", () => {
  const plan = planClip(clip({ codec: null }));
  assert.equal(plan.transcode, false, "not knowing is not the same as knowing it is wrong");
});

test("H.264 is recognised in every shape a demuxer reports it", () => {
  for (const codec of ["avc", "avc1.42001f", "avc3.640028", "h264", "AVC1.4D401F"]) {
    assert.equal(isAvc(codec), true, codec);
  }
  for (const codec of ["hvc1.1.6.L93.B0", "vp09.00.10.08", "av01.0.04M.08", null]) {
    assert.equal(isAvc(codec), false, String(codec));
  }
});

test("only real MP4 containers count as MP4", () => {
  assert.equal(isMp4Container("video/mp4"), true);
  assert.equal(isMp4Container("video/quicktime"), false);
  assert.equal(isMp4Container("video/webm"), false);
});

/* ── clips: audio is never the reason ─────────────────────── */

test("audio cannot cause a transcode, because the policy cannot even see it", () => {
  // Structural, not incidental: ClipFacts carries no audio field at all, so
  // there is no way for the presence of a soundtrack to trigger an encode.
  // Audio is discarded when a transcode happens for some other reason.
  const facts = clip();
  assert.equal("hasAudio" in facts, false);
  assert.equal("audioTracks" in facts, false);
  assert.equal(planClip(facts).transcode, false);

  const source = readFileSync(new URL("../lib/studio-local/clip-optimize.ts", import.meta.url), "utf8");
  assert.match(source, /audio:\s*\{\s*discard:\s*true\s*\}/, "and it is dropped when one does happen");
});

/* ── the limits that protect the phone and the bucket ─────── */

test("a source too large to decode safely is refused rather than attempted", () => {
  assert.ok(MAX_SOURCE_CLIP_BYTES > MAX_CLIP_BYTES, "there is room to shrink into the cap");
  assert.ok(MAX_SOURCE_CLIP_BYTES <= 256 * 1024 * 1024, "but not so much that a phone dies trying");
});

test("the final clip ceiling is still the one the server enforces", () => {
  assert.equal(MAX_CLIP_BYTES, 50 * 1024 * 1024);
  const route = readFileSync(new URL("../app/api/r2/sign/route.ts", import.meta.url), "utf8");
  assert.match(route, /50 \* 1024 \* 1024/, "the server cap is unchanged and independent");
});

test("the duration ceiling is unchanged", () => {
  assert.equal(MAX_CLIP_SECONDS, 60);
});

test("the image recompression floor is a sane size for a good photo", () => {
  assert.ok(RECOMPRESS_FLOOR_BYTES >= 256 * 1024 && RECOMPRESS_FLOOR_BYTES <= 2 * 1024 * 1024);
});

/* ── the ingest boundary, asserted on the source ──────────── */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments are prose about the code, not the code. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("optimization happens at the shared boundary, not in a component", () => {
  // Camera, single-file picker and multi-photo sheet all arrive at
  // stashMedia(). If the optimizer were called from a component instead, one
  // of those routes would quietly store originals.
  const media = code("lib/studio-local/media.ts");
  assert.match(media, /optimizeForIngest/, "stashMedia owns the optimization");

  for (const ui of [
    "components/admin/media-capture.tsx",
    "components/admin/mobile/media-picker-sheet.tsx",
  ]) {
    assert.ok(
      !code(ui).includes("optimizeForIngest"),
      `${ui} must not optimize on its own`
    );
  }
});

test("the optimized file is the one stored, and the one the limits judge", () => {
  const media = code("lib/studio-local/media.ts");
  assert.match(media, /blob:\s*kept/, "IndexedDB gets the optimized blob");
  assert.match(media, /size:\s*kept\.size/, "and the recorded size is its size");
  assert.match(media, /usage \+ kept\.size/, "the quota check uses the final size");
  assert.match(media, /checkClipFile\(kept\)/, "and the clip gate validates the final file");
});

test("optimization runs before anything touches the network", () => {
  const media = code("lib/studio-local/media.ts");
  const optimize = media.indexOf("optimizeForIngest");
  const store = media.indexOf("dbPut<PendingMedia>");
  assert.ok(optimize > 0 && store > 0 && optimize < store, "optimize, then store");
  assert.ok(
    !code("lib/studio-local/media-optimize.ts").includes("fetch("),
    "the optimizer never reaches for the network, so it works offline"
  );
});

test("the placeholder scheme and upload destinations are untouched", () => {
  const media = code("lib/studio-local/media.ts");
  assert.match(media, /PENDING_PREFIX/, "pending:<uuid> is still how a block refers to it");
  assert.match(media, /\/api\/cloudinary\/sign/, "photos still go to Cloudinary");
  assert.match(media, /\/api\/r2\/sign/, "clips still go to R2");
  assert.match(media, /flushPendingMedia/, "and the existing outbox flush still owns sending");
});

test("a failed optimization falls back to the original rather than losing it", () => {
  const image = code("lib/studio-local/image-optimize.ts");
  // Every early return in the image optimizer hands back the original file.
  assert.match(image, /untouched\(file, "undecodable"\)/);
  assert.match(image, /untouched\(file, "encode-failed"/);
  assert.match(image, /untouched\(file, "not-worth-it"/);
  assert.match(image, /untouched\(file, "error"\)/);

  const clipSrc = code("lib/studio-local/clip-optimize.ts");
  assert.match(clipSrc, /untouched\(file, "no-encoder"/, "no H.264 encoder keeps the original");
  assert.match(clipSrc, /untouched\(file, "unreadable"\)/);
});

test("the video encoder is never on the startup path", () => {
  const clipSrc = code("lib/studio-local/clip-optimize.ts");
  assert.ok(
    !/^\s*import\s+[^;]*from\s+["']mediabunny["']/m.test(clipSrc),
    "mediabunny must not be imported statically"
  );
  assert.match(clipSrc, /import\(["']mediabunny["']\)/, "it is loaded on demand");

  // And nothing else in the repository pulls it in eagerly.
  const eager = source("lib/studio-local/media-optimize.ts");
  assert.ok(!/^import .*mediabunny/m.test(eager));
});

test("clips are processed one at a time", () => {
  // Two concurrent WebCodecs pipelines is how an iPhone tab gets killed.
  const clipSrc = code("lib/studio-local/clip-optimize.ts");
  assert.match(clipSrc, /serialize\(/, "transcodes go through a queue");

  const picker = code("components/admin/mobile/media-picker-sheet.tsx");
  assert.match(picker, /for \(const \[index, file\] of chosen\.entries\(\)\)/);
  assert.match(picker, /await stashMedia\(/, "and photos are awaited one by one");
});

test("no heavyweight wasm transcoder was added", () => {
  const pkg = JSON.parse(source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of ["@ffmpeg/ffmpeg", "@ffmpeg/core", "ffmpeg.wasm", "@ffmpeg/util"]) {
    assert.equal(banned in deps, false, `${banned} is not a dependency`);
  }
  assert.ok("mediabunny" in deps, "the WebCodecs toolkit is");
});

/* ── the words shown while it works ───────────────────────── */

test("each ingest phase has something calm to say", () => {
  assert.equal(ingestLabel(null), "Keeping…");
  assert.equal(ingestLabel({ phase: "inspecting" }), "Preparing…");
  assert.equal(ingestLabel({ phase: "optimizing" }, "image"), "Optimizing photo…");
  assert.equal(ingestLabel({ phase: "optimizing" }, "loop-clip"), "Compressing clip…");
  assert.equal(ingestLabel({ phase: "storing" }), "Keeping…");
});

test("a clip reports its progress once there is progress to report", () => {
  assert.equal(
    ingestLabel({ phase: "optimizing", ratio: 0.36 }, "loop-clip"),
    "Compressing clip… 36%"
  );
  // 0% for the first second of a long encode reads as stuck, not as starting.
  assert.equal(ingestLabel({ phase: "optimizing", ratio: 0 }, "loop-clip"), "Compressing clip…");
});

test("the saving note stays quiet unless the saving is interesting", () => {
  assert.equal(savingNote(undefined), null);
  assert.equal(
    savingNote({ optimized: false, originalBytes: 100, finalBytes: 100, savedBytes: 0, savedRatio: 0 }),
    null
  );
  // Saved a lot, but only a few kilobytes of it.
  assert.equal(
    savingNote({ optimized: true, originalBytes: 400_000, finalBytes: 100_000, savedBytes: 300_000, savedRatio: 0.75 }),
    null
  );
  assert.equal(
    savingNote({
      optimized: true,
      originalBytes: 18.6 * 1024 * 1024,
      finalBytes: 5.2 * 1024 * 1024,
      savedBytes: 13.4 * 1024 * 1024,
      savedRatio: 0.72,
    }),
    "18.6 MB → 5.2 MB · saved 72%"
  );
});
