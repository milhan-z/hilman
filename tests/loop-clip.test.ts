import assert from "node:assert/strict";
import test from "node:test";
import { checkClipFile, MAX_CLIP_BYTES, MAX_CLIP_SECONDS } from "../lib/studio-local/clip-check";
import { BLOCK_HINTS } from "../lib/types";
import { blockReference } from "../lib/studio-import-reference";
import { parseStudioJson } from "../lib/studio-import";
import { promptTextsOf } from "../lib/starter-prompts";
import { extractR2Key, resolveLoopClipSrc } from "../lib/loop-clip";

/**
 * Loop Clip: a new, independent block backed by Cloudflare R2.
 *
 * Two things are being defended here.
 *
 * The first is `checkClipFile()` — the "detect/reject a MOV/HEVC file
 * instead of silently uploading it" gate. It runs in a browser normally, and
 * the second half of it (an actual playback probe through a hidden <video>
 * element) needs a DOM this test environment does not have. The module
 * itself accounts for that — `typeof document === "undefined"` skips the
 * probe rather than throwing — so what is tested here is exactly the part
 * that runs everywhere: the container check, which the file's own comment
 * explains is doing more of the real work than the probe anyway.
 *
 * The second is that the block slots into the existing registries the same
 * way `image` or `youtube` already do — BLOCK_HINTS, the importer's
 * reference doc, and Studio JSON import — without any of them needing a
 * hardcoded list of block types to grow by hand.
 */

const mp4 = (bytes: number, name = "clip.mp4", type = "video/mp4") =>
  new File([new Uint8Array(bytes)], name, { type });

/* ── the format gate ──────────────────────────────────────── */

test("a plain MP4 passes the container check", async () => {
  const result = await checkClipFile(mp4(1024));
  assert.equal(result.ok, true);
});

test("a .mov export is rejected, and told why in terms of MP4", async () => {
  const file = new File([new Uint8Array(1024)], "IMG_0001.MOV", { type: "video/quicktime" });
  const result = await checkClipFile(file);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /MP4/);
  assert.match(result.reason!, /video\/quicktime/);
});

test("an mp4 with no reported type is accepted by its extension", async () => {
  // Some browsers/OSes hand back an empty File.type for an otherwise-normal
  // file; the container name is still evidence.
  const file = new File([new Uint8Array(1024)], "clip.mp4", { type: "" });
  const result = await checkClipFile(file);
  assert.equal(result.ok, true);
});

test("a file with neither an mp4 type nor an mp4 name is rejected", async () => {
  const file = new File([new Uint8Array(1024)], "clip.webm", { type: "video/webm" });
  const result = await checkClipFile(file);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /video\/webm/);
});

test("an image mistakenly offered to Loop Clip is rejected as a format problem", async () => {
  const file = new File([new Uint8Array(1024)], "photo.jpg", { type: "image/jpeg" });
  const result = await checkClipFile(file);
  assert.equal(result.ok, false);
  assert.match(result.reason!, /MP4/);
});

/* ── the size gate ────────────────────────────────────────── */

test("a clip at the size ceiling is accepted", async () => {
  const result = await checkClipFile(mp4(MAX_CLIP_BYTES));
  assert.equal(result.ok, true);
});

test("a clip over the size ceiling is rejected, with the actual size named", async () => {
  const result = await checkClipFile(mp4(MAX_CLIP_BYTES + 1024));
  assert.equal(result.ok, false);
  assert.match(result.reason!, /MB/);
  assert.match(result.reason!, new RegExp(String(Math.round(MAX_CLIP_BYTES / (1024 * 1024)))));
});

test("the duration ceiling is defined and reasonable for a short clip", () => {
  assert.equal(MAX_CLIP_SECONDS, 60);
});

/* ── without a DOM, the container check is still the one that runs ── */

test("checkClipFile does not require a browser to reach a verdict", async () => {
  assert.equal(typeof document, "undefined", "this test asserts the Node environment has no DOM");
  const good = await checkClipFile(mp4(2048));
  const bad = await checkClipFile(mp4(2048, "clip.mov", "video/quicktime"));
  assert.equal(good.ok, true);
  assert.equal(bad.ok, false);
});

/* ── the block is a first-class citizen of the registries ─── */

test("loop-clip has a schema hint, the way every other block does", () => {
  assert.ok(BLOCK_HINTS["loop-clip"]);
  assert.match(BLOCK_HINTS["loop-clip"], /src/);
  assert.match(BLOCK_HINTS["loop-clip"], /autoplay/);
});

test("loop-clip appears in the importer's own block reference automatically", () => {
  const row = blockReference().find((entry) => entry.type === "loop-clip");
  assert.ok(row, "blockReference() derives from BLOCK_HINTS and should include it without being told to");
  assert.equal(row!.hint, BLOCK_HINTS["loop-clip"]);
  assert.match(row!.note ?? "", /https/);
});

test("a Studio JSON document can contain a loop-clip block", () => {
  const doc = JSON.stringify({
    version: 1,
    kind: "project",
    title: "A project",
    blocks: [
      {
        type: "loop-clip",
        data: { src: "https://pub-example.r2.dev/clips/a.mp4", caption: "Progress", fit: "cover" },
      },
    ],
  });
  const outcome = parseStudioJson(doc, "project");
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.summary.blocks.length, 1);
    assert.equal(outcome.summary.blocks[0].type, "loop-clip");
    assert.equal(outcome.summary.blocks[0].data.src, "https://pub-example.r2.dev/clips/a.mp4");
  }
});

test("a loop-clip caption is recognised as a prompt field, same as youtube's", () => {
  const texts = promptTextsOf({ type: "loop-clip", data: { caption: "What prompted this note?" } });
  assert.deepEqual(texts, ["What prompted this note?"]);
});

test("custom is still the only block the importer refuses, loop-clip is not swept up with it", () => {
  const doc = JSON.stringify({
    version: 1,
    kind: "journal",
    blocks: [
      { type: "loop-clip", data: { src: "https://pub-example.r2.dev/clips/a.mp4" } },
      { type: "custom", data: { component: "ink-field" } },
    ],
  });
  const outcome = parseStudioJson(doc, "journal");
  assert.equal(outcome.ok, true);
  if (outcome.ok) {
    assert.equal(outcome.summary.blocks.length, 1, "only the loop-clip block should survive");
    assert.equal(outcome.summary.blocks[0].type, "loop-clip");
    assert.ok(outcome.summary.warnings.some((w) => w.includes("custom")));
  }
});

/* ── extractR2Key: extracts the storage key from any format ── */

test("extractR2Key: r2.dev URL extracts key", () => {
  assert.equal(
    extractR2Key("https://pub-3c19daed961f4d518bee661c8e6af73a.r2.dev/clips/abc.mp4"),
    "clips/abc.mp4",
  );
});

test("extractR2Key: local proxy path extracts key", () => {
  assert.equal(extractR2Key("/api/r2/media/clips/abc.mp4"), "clips/abc.mp4");
});

test("extractR2Key: r2: prefix extracts key", () => {
  assert.equal(extractR2Key("r2:clips/abc.mp4"), "clips/abc.mp4");
});

test("extractR2Key: bare key passes through", () => {
  assert.equal(extractR2Key("clips/abc.mp4"), "clips/abc.mp4");
});

test("extractR2Key: custom domain URL extracts key", () => {
  assert.equal(
    extractR2Key("https://media.hilman.design/clips/abc.mp4"),
    "clips/abc.mp4",
  );
});

test("extractR2Key: pending: returns null", () => {
  assert.equal(extractR2Key("pending:some-uuid"), null);
});

test("extractR2Key: blob: returns null", () => {
  assert.equal(extractR2Key("blob:http://localhost/abcd"), null);
});

test("extractR2Key: null returns null", () => {
  assert.equal(extractR2Key(null), null);
});

test("extractR2Key: empty string returns null", () => {
  assert.equal(extractR2Key(""), null);
});

test("extractR2Key: unrelated URL returns null", () => {
  assert.equal(extractR2Key("https://example.com/photo.jpg"), null);
});

/* ── resolveLoopClipSrc: resolves any format to delivery URL ── */

test("resolveLoopClipSrc: r2.dev URL resolves to proxy fallback when no custom domain", () => {
  // In test env, NEXT_PUBLIC_R2_PUBLIC_URL is either unset or is r2.dev,
  // so delivery base should fall back to /api/r2/media
  const result = resolveLoopClipSrc(
    "https://pub-3c19daed961f4d518bee661c8e6af73a.r2.dev/clips/abc.mp4",
  );
  assert.equal(result, "/api/r2/media/clips/abc.mp4");
});

test("resolveLoopClipSrc: bare key resolves to proxy fallback", () => {
  const result = resolveLoopClipSrc("clips/abc.mp4");
  assert.equal(result, "/api/r2/media/clips/abc.mp4");
});

test("resolveLoopClipSrc: r2: prefix resolves to proxy fallback", () => {
  const result = resolveLoopClipSrc("r2:clips/abc.mp4");
  assert.equal(result, "/api/r2/media/clips/abc.mp4");
});

test("resolveLoopClipSrc: pending: passes through unchanged", () => {
  assert.equal(resolveLoopClipSrc("pending:some-uuid"), "pending:some-uuid");
});

test("resolveLoopClipSrc: blob: passes through unchanged", () => {
  assert.equal(
    resolveLoopClipSrc("blob:http://localhost/abcd"),
    "blob:http://localhost/abcd",
  );
});

test("resolveLoopClipSrc: null returns empty string", () => {
  assert.equal(resolveLoopClipSrc(null), "");
});

test("resolveLoopClipSrc: empty string returns empty string", () => {
  assert.equal(resolveLoopClipSrc(""), "");
});

test("resolveLoopClipSrc: already a proxy path stays unchanged", () => {
  const result = resolveLoopClipSrc("/api/r2/media/clips/abc.mp4");
  assert.equal(result, "/api/r2/media/clips/abc.mp4");
});
