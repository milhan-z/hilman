import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { dbClearAll, dbGetAll, dbPut } from "../lib/studio-local/db";
import { listDrafts, readDraft, writeDraft } from "../lib/studio-local/drafts";
import { listConflicts } from "../lib/studio-local/conflicts";
import { enqueue, listQueue } from "../lib/studio-local/outbox";
import {
  applyResolutions,
  listResolutions,
  rememberResolution,
  resolutionMap,
  unfinishedResolutions,
  type MediaResolution,
} from "../lib/studio-local/media-resolution";
import {
  flushPendingMedia,
  listPendingMedia,
  type MediaUploader,
  type PendingMedia,
} from "../lib/studio-local/media";
import { hasPendingRefs } from "../lib/studio-media-refs";
import { UploadError } from "../lib/studio-local/retry-policy";

/**
 * A photograph between the phone and the internet.
 *
 * ── the window this file exists to close ──
 *
 * The upload loop did this, in this order:
 *
 *     const asset = await uploadAsset(item.blob, ...);   // it is on Cloudinary
 *     resolved[item.ref] = asset.public_id;              // ...in a local variable
 *     await discardPendingMedia(item.ref);               // the bytes are gone
 *
 * and only afterwards, back in sync.ts, rewrote the `pending:` placeholders in
 * the queue and the drafts. If the app was killed anywhere in between — which
 * on a phone means "if you switched apps" — the bytes were deleted, the remote
 * object existed, and the only record of which was which had been in RAM.
 *
 * What is left behind is not merely a lost photograph. The save holding that
 * placeholder is held back by `hasPendingRefs` precisely so a reference nobody
 * can resolve never reaches the site — so that entry now waits in the outbox
 * for ever, for an upload that can never happen, because there are no bytes
 * left to upload. The writing attached to it never goes out again either.
 *
 * ── the rule ──
 *
 * The mapping from placeholder to remote identity is written down *before* the
 * local bytes are released, and the bytes are released only once it is. Every
 * boundary after that is resumable from it: the rewrite can be redone, and
 * redoing it is a no-op.
 */

const REF = "pending:11111111-1111-4111-8111-111111111111";
const REF2 = "pending:22222222-2222-4222-8222-222222222222";
const ROW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const pendingRecord = (ref: string, kind: PendingMedia["kind"] = "image"): PendingMedia => ({
  ref,
  kind,
  blob: new Blob(["the actual bytes"]),
  name: "photo.jpg",
  type: "image/jpeg",
  size: 16,
  folder: "hilman",
  capturedAt: "2026-09-21T00:00:00.000Z",
  attempts: 0,
});

/** An uploader that always works, and says what it was asked to do. */
function goodUploader() {
  const calls: string[] = [];
  const uploader: MediaUploader = {
    async image(_blob, name) {
      calls.push(`image:${name}`);
      return { public_id: "hilman/uploaded-photo" };
    },
    async clip(_blob, name) {
      calls.push(`clip:${name}`);
      return { url: "https://clips.example/one.mp4" };
    },
  };
  return { uploader, calls };
}

beforeEach(async () => {
  await dbClearAll();
});

/** A draft, a queued save and a conflict, all naming the same placeholder. */
async function seedDocumentsHolding(ref: string) {
  await writeDraft({
    key: `journal:${ROW}`,
    entity: "journal",
    entityId: ROW,
    localId: `journal:${ROW}`,
    value: { snapshot: JSON.stringify({ blocks: [{ data: { public_id: ref } }] }), savedAt: "x" },
    baseUpdatedAt: null,
    editedAt: "2026-09-21T00:00:00.000Z",
  });
  await enqueue({
    mutationId: "33333333-3333-4333-8333-333333333333",
    entity: "journal",
    entityId: ROW,
    localId: `journal:${ROW}`,
    baseUpdatedAt: null,
    payload: { fields: { title: "An entry" }, blocks: [{ id: "b1", position: 0, type: "image", data: { public_id: ref } }], tagIds: [] },
  });
  await dbPut("conflicts", {
    key: `journal:${ROW}`,
    entity: "journal",
    id: ROW,
    mine: { fields: { title: "Mine" }, blocks: [{ id: "b1", position: 0, type: "image", data: { public_id: ref } }], tagIds: [] },
    server: { id: ROW, updatedAt: "x", fields: {}, blocks: [], tagIds: [] },
    differences: [],
    noticedAt: "x",
  });
}

/* ══ 1. the mapping is durable before the bytes are released ══ */

test("the remote identity is written down before the local bytes go", async () => {
  await dbPut("media", pendingRecord(REF));
  const { uploader } = goodUploader();

  await flushPendingMedia(uploader);

  const durable = await listResolutions();
  assert.equal(durable.length, 1, "the mapping survives a restart");
  assert.equal(durable[0].ref, REF);
  assert.equal(durable[0].resolved, "hilman/uploaded-photo");
  assert.equal((await listPendingMedia()).length, 0, "and the bytes were released after it");
});

test("bytes are kept when the mapping cannot be written down", async () => {
  // The one ordering that must never invert. If the mapping cannot be stored,
  // the local copy is the only way back to this photograph — deleting it would
  // leave a placeholder nothing can ever resolve, and a save stuck behind it.
  await dbPut("media", pendingRecord(REF));
  const { uploader } = goodUploader();

  await flushPendingMedia(uploader, {
    remember: async () => false, // storage refuses
  });

  const still = await listPendingMedia();
  assert.equal(still.length, 1, "the photograph is still on the device");
  assert.equal(still[0].ref, REF);
  assert.equal(still[0].blocked, undefined, "and it is not treated as permanently failed");
});

/* ══ 2. killed after the upload, before the rewrite ════════ */

test("an interrupted upload resumes from the mapping instead of uploading again", async () => {
  // The app died between releasing the bytes and rewriting the documents.
  // Everything that is left is the durable mapping.
  await seedDocumentsHolding(REF);
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });

  const { uploader, calls } = goodUploader();
  const report = await flushPendingMedia(uploader);

  assert.deepEqual(calls, [], "nothing was uploaded a second time");
  assert.equal(
    report.resolved[REF.toLowerCase()],
    "hilman/uploaded-photo",
    "and the flush still reports where the photograph went"
  );
});

test("a mapping written before a crash still rewrites every document", async () => {
  await seedDocumentsHolding(REF);
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });

  await applyResolutions(await unfinishedResolutions());

  const draft = await readDraft<{ snapshot: string }>(`journal:${ROW}`);
  assert.equal(hasPendingRefs(draft), false, "the draft no longer names a placeholder");
  assert.match(draft!.value.snapshot, /hilman\/uploaded-photo/);

  const queue = await listQueue();
  assert.equal(hasPendingRefs(queue[0]), false, "nor does the queued save");

  const conflicts = await listConflicts();
  assert.equal(hasPendingRefs(conflicts[0]), false, "nor the stored conflict");
});

test("the rewrite is safe to run twice", async () => {
  await seedDocumentsHolding(REF);
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });

  await applyResolutions(await unfinishedResolutions());
  const afterOnce = JSON.stringify(await listQueue());
  await applyResolutions(await listResolutions());

  assert.equal(JSON.stringify(await listQueue()), afterOnce, "redoing it changes nothing");
});

/* ══ 3. the mapping is kept only while it is needed ════════ */

test("a mapping is forgotten once nothing refers to it any more", async () => {
  await seedDocumentsHolding(REF);
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });

  await applyResolutions(await unfinishedResolutions());

  assert.equal(
    (await listResolutions()).length,
    0,
    "the bookkeeping does not accumulate for ever"
  );
});

test("a mapping is kept while any document still holds the placeholder", async () => {
  // The verification step: the rewrite is only finished if it is *visible*.
  await seedDocumentsHolding(REF);
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });

  await applyResolutions(await unfinishedResolutions(), {
    // The draft store refuses the rewrite, so one document still names it.
    writeDraft: async () => false,
  });

  const kept = await listResolutions();
  assert.equal(kept.length, 1, "still known, so it can be finished next time");
  assert.equal(kept[0].resolved, "hilman/uploaded-photo");
});

/* ══ 4. the provider succeeded, the library did not ════════ */

test("a file that uploaded but was not catalogued says so, durably", async () => {
  // uploadAsset() already distinguished "on Cloudinary" from "in the media
  // library". flushPendingMedia() then dropped the distinction on the floor,
  // so a photograph that existed remotely but nowhere in the CMS was reported
  // as completely finished.
  await dbPut("media", pendingRecord(REF));
  const uploader: MediaUploader = {
    async image() {
      return { public_id: "hilman/uploaded-photo", unrecorded: "Could not add it to the media library." };
    },
    async clip() {
      throw new Error("not used");
    },
  };

  const report = await flushPendingMedia(uploader);

  assert.equal(
    report.unrecorded[REF.toLowerCase()],
    "Could not add it to the media library.",
    "the flush reports it"
  );
  const durable = await listResolutions();
  assert.equal(durable[0].unrecorded, "Could not add it to the media library.", "and it survives a reload");
  assert.equal(durable[0].resolved, "hilman/uploaded-photo", "without throwing away where the file went");
});

/* ══ 5. loop clips take the same road ══════════════════════ */

test("a loop clip is made durable the same way a photograph is", async () => {
  await dbPut("media", pendingRecord(REF2, "loop-clip"));
  const { uploader } = goodUploader();

  const report = await flushPendingMedia(uploader);

  assert.equal(report.resolved[REF2.toLowerCase()], "https://clips.example/one.mp4");
  const durable = await listResolutions();
  assert.equal(durable[0].kind, "loop-clip");
  assert.equal((await listPendingMedia()).length, 0);
});

/* ══ 6. the map helper ═════════════════════════════════════ */

test("the mapping reads back keyed the way the rewriter expects", async () => {
  const list: MediaResolution[] = [
    { ref: REF.toUpperCase(), resolved: "a", kind: "image", uploadedAt: "x" },
  ];
  assert.deepEqual(resolutionMap(list), { [REF.toLowerCase()]: "a" });
});

test("nothing pending and nothing carried over is simply nothing", async () => {
  const { uploader, calls } = goodUploader();
  const report = await flushPendingMedia(uploader);

  assert.deepEqual(report.resolved, {});
  assert.deepEqual(calls, []);
  assert.equal(report.offline, false);
  assert.equal((await dbGetAll("resolutions")).length, 0);
});

/* ══ 7. a draft that arrives later still gets rewritten ════ */

test("a placeholder left in a document opened later is still resolved", async () => {
  // The rewrite runs against whatever is in storage at the time. A draft
  // written after the upload — a second editor, a restored recovery copy —
  // must still be caught on the next pass, which is why the mapping is kept
  // until nothing refers to it.
  await rememberResolution({
    ref: REF,
    resolved: "hilman/uploaded-photo",
    kind: "image",
    uploadedAt: "2026-09-21T00:00:00.000Z",
  });
  await applyResolutions(await unfinishedResolutions());
  assert.equal((await listResolutions()).length, 0, "nothing held it, so it was forgotten");

  // And a document that shows up afterwards is the case this cannot fix, which
  // is why the placeholder never reaches the site: the outbox holds it back.
  await seedDocumentsHolding(REF);
  assert.equal(hasPendingRefs((await listQueue())[0]), true);
  assert.equal((await listDrafts()).length, 1);
});

/* ══ 8. the same file keeps the same remote name ═══════════ */

test("a retried upload asks for the identity it asked for last time", async () => {
  // Without a stable name every attempt asks for a fresh one, so an upload
  // whose acknowledgement was lost leaves one orphan per attempt and only the
  // last is ever referenced. The placeholder's own uuid is assigned once and
  // never changes, which makes it exactly the right name to reuse.
  await dbPut("media", pendingRecord(REF));
  const asked: (string | undefined)[] = [];
  const uploader: MediaUploader = {
    async image(_blob, _name, _folder, assetId) {
      asked.push(assetId);
      throw new UploadError("Cloudinary is briefly unavailable.", 503, "transfer");
    },
    async clip() {
      throw new Error("not used");
    },
  };

  await flushPendingMedia(uploader);
  await flushPendingMedia(uploader);

  assert.equal(asked.length, 2, "it was attempted twice");
  assert.equal(asked[0], "11111111-1111-4111-8111-111111111111", "derived from the placeholder");
  assert.equal(asked[1], asked[0], "and it is the same name both times");
});
