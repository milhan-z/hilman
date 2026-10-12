import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import type { Input as MediaInput } from "mediabunny";
import { inspectClip, optimizeClip } from "../lib/studio-local/clip-optimize";
import { checkClipFile } from "../lib/studio-local/clip-check";
import { dbClearAll } from "../lib/studio-local/db";
import { stashMedia, listPendingMedia } from "../lib/studio-local/media";

const fixture = (name: "h264" | "hevc", type = "video/mp4") =>
  new File([readFileSync(new URL(`./fixtures/media/${name}.mp4`, import.meta.url))], `${name}.mp4`, { type });

beforeEach(async () => { await dbClearAll(); });

test("inspection identifies actual codecs independently of filename and reported MIME", async () => {
  const avc = await inspectClip(fixture("h264", "video/quicktime"));
  const hevc = await inspectClip(fixture("hevc"));
  assert.match(avc!.codec!, /^avc1\./);
  assert.equal(avc!.type, "video/mp4");
  assert.match(hevc!.codec!, /^hev1\./);
  assert.equal(hevc!.durationSeconds, 1);
});

test("demuxing releases the input on both valid and unreadable files", async (t) => {
  const { Input } = await import("mediabunny");
  const disposed = t.mock.method(Input.prototype, "dispose");
  assert.ok(await inspectClip(fixture("h264")));
  assert.equal(await inspectClip(new File(["broken"], "bad.mp4")), null);
  assert.equal(disposed.mock.callCount(), 2);
});

test("without a browser encoder HEVC is retained as source but cannot be stashed", async () => {
  assert.equal(typeof VideoEncoder, "undefined");
  const file = fixture("hevc");
  const result = await optimizeClip(file);
  assert.equal(result.file, file);
  assert.equal(result.report.skipped, "no-encoder");
  const gate = await checkClipFile(result.file);
  assert.equal(gate.ok, false);
  const stashed = await stashMedia(file, "clips", "loop-clip");
  assert.equal(stashed.ok, false);
  assert.deepEqual(await listPendingMedia(), []);
});

test("an accepted MP4 with omitted MIME is stored using its verified signing type", async () => {
  const result = await stashMedia(fixture("h264", ""), "clips", "loop-clip");
  assert.equal(result.ok, true);
  const [stored] = await listPendingMedia();
  assert.equal(stored.type, "video/mp4");
  assert.equal(stored.blob.type, "video/mp4");
});

test("cancel before ingest leaves no pending media", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled by author"));
  const result = await stashMedia(fixture("h264"), "clips", "loop-clip", undefined, controller.signal);
  assert.deepEqual(result, { ok: false, reason: "Cancelled by author" });
  assert.deepEqual(await listPendingMedia(), []);
});

test("a queued clip can cancel promptly without inspecting or blocking the next job", async (t) => {
  const { Input } = await import("mediabunny");
  const original = Input.prototype.getPrimaryVideoTrack;
  let release!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const inspecting = new Promise<void>((resolve) => { started = resolve; });
  let first = true;
  t.mock.method(Input.prototype, "getPrimaryVideoTrack", async function (this: MediaInput, ...args: Parameters<typeof original>) {
    if (first) { first = false; started(); await waiting; }
    return original.apply(this, args);
  });
  const active = optimizeClip(fixture("h264"));
  await inspecting;
  const controller = new AbortController();
  let inspected = false;
  const queued = optimizeClip(fixture("hevc"), () => { inspected = true; }, controller.signal);
  controller.abort(new Error("Cancel queued clip"));
  await assert.rejects(queued, /Cancel queued clip/);
  assert.equal(inspected, false);
  release();
  await active;
  const following = await optimizeClip(fixture("h264"));
  assert.equal(following.report.skipped, "no-encoder");
});

test("storage pressure refuses verified clips before creating a pending reference", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { storage: { estimate: async () => ({ quota: 1000, usage: 900 }) } },
  });
  t.after(() => { if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor); });
  const result = await stashMedia(fixture("h264"), "clips", "loop-clip");
  assert.equal(result.ok, false);
  assert.match(result.ok ? "" : result.reason, /nearly out of space/);
  assert.deepEqual(await listPendingMedia(), []);
});
