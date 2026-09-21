"use client";

import { recordMedia } from "@/app/admin/actions";
import { PENDING_PREFIX } from "../studio-media-refs";
import { checkClipFile } from "./clip-check";
import { dbDelete, dbGetAll, dbPut } from "./db";
import {
  MediaTooLargeError,
  optimizeForIngest,
  type MediaReport,
  type ProgressFn,
} from "./media-optimize";
import {
  rememberResolution,
  resolutionMap,
  unfinishedResolutions,
} from "./media-resolution";
import { classifyUploadFailure, UploadError } from "./retry-policy";
import { newMutationId } from "./save";

/**
 * Media that exists only on this phone, so far.
 *
 * Uploading is the one part of the studio that genuinely cannot be deferred
 * into a database row: the remote store needs the bytes. So the bytes are
 * kept here, as a Blob in IndexedDB, and the block that wants the photo or
 * clip holds a `pending:<uuid>` placeholder until the upload finishes.
 *
 * Two things follow from that, and both are load-bearing:
 *
 *  - The file is stored *before* anything is attempted over the network, so a
 *    picture or clip taken with no signal survives the app being closed.
 *  - A save whose payload still names a placeholder is held back by the outbox
 *    (see sync.ts), so the site is never asked to show something nobody else
 *    can reach.
 *
 * ── two kinds, one placeholder scheme ──
 *
 * Everything above is provider-agnostic by construction: `pending:<uuid>`
 * carries no hint of where it is going, and `replacePendingRefs()` in
 * studio-media-refs.ts is a blind string swap that has never needed to know.
 * The only place that *was* hardwired to one destination was this file —
 * `uploadAsset()` reached straight for `/api/cloudinary/sign`. `kind` is what
 * that hardwiring became: recorded once, at the moment a file is stashed, so
 * everything downstream (the outbox flush, the retry, the pending preview)
 * can ask "how do I finish this one" instead of assuming.
 *
 * Photos still go to Cloudinary — nothing about that path changed. Loop Clips
 * go to Cloudflare R2, added here rather than as a parallel uploader, because
 * a second local-first system next to this one is how a photo taken offline
 * and a clip taken offline would end up surviving differently.
 */

export type PendingMediaKind = "image" | "loop-clip";

export interface PendingMedia {
  /** `pending:<uuid>` — the key, and the string blocks actually hold. */
  ref: string;
  /** Decided once, at stash time — see the file comment. Defaults to "image" so old records read back unchanged. */
  kind: PendingMediaKind;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  folder: string;
  capturedAt: string;
  attempts: number;
  lastError?: string;
  /** The remote store refused it for a reason retrying will not change. */
  blocked?: boolean;
}

export type StashResult =
  | { ok: true; ref: string; report?: MediaReport }
  | { ok: false; reason: string };

/**
 * How much of the browser's storage allowance we are willing to hold.
 *
 * Going over does not fail gracefully: the browser starts evicting, and what
 * it evicts is the same database holding the drafts. Stopping at four fifths
 * leaves room for the text, which is the part that cannot be retaken.
 */
const QUOTA_CEILING = 0.8;

/**
 * Big enough for a phone photo, small enough to notice a video by mistake.
 *
 * Checked against the file *after* optimization, because the question it asks
 * is "is this reasonable to keep and send", and what gets kept and sent is the
 * optimized one. A 40 MB export that becomes a 3 MB upload is a photograph
 * this studio can happily take.
 */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * A ceiling on what is worth *decoding*, as opposed to what is worth keeping.
 *
 * Optimization has to get the pixels into memory before it can shrink them,
 * and a phone asked to decode a few hundred megapixels will drop the tab
 * rather than say no. Refusing early is the difference between a sentence and
 * a lost draft.
 */
const MAX_SOURCE_IMAGE_BYTES = 80 * 1024 * 1024;

export interface StorageReport {
  usage: number;
  quota: number;
  /** 0–1, or null when the browser will not say. */
  ratio: number | null;
}

export async function storageReport(): Promise<StorageReport | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota > 0 ? usage / quota : null };
  } catch {
    return null;
  }
}

const readable = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/**
 * Keeps a file on the device and hands back the placeholder to put in a block.
 *
 * Refuses rather than half-succeeds: a photo that was accepted and then
 * silently dropped when the browser ran out of room is worse than one that was
 * never taken, because you stop checking.
 *
 * ── the ingest boundary ──
 *
 * This is where local media optimization happens, and it is here rather than
 * in any component on purpose: the camera, the single-file picker and the
 * multi-photo sheet all arrive at this function, so there is no route into
 * IndexedDB that can quietly skip it and no way for two surfaces to disagree
 * about what a stored photograph is.
 *
 * The order matters. Optimization runs *before* storage and before the
 * network, so what gets written down is already the small version — uploading
 * an original and shrinking it later would defeat the point on a phone, and
 * would not survive being offline. Everything after it asks its questions
 * about the optimized file, including the quota check.
 *
 * A Loop Clip is still gated by `checkClipFile()` — see
 * lib/studio-local/clip-check.ts for what that check can and cannot promise —
 * but now on the way out rather than the way in. A MOV that the optimizer
 * managed to normalize into an MP4 passes it; one that could not be normalized
 * meets exactly the refusal it always did.
 */
export async function stashMedia(
  file: File,
  folder = "hilman",
  kind: PendingMediaKind = "image",
  onProgress?: ProgressFn
): Promise<StashResult> {
  if (kind === "image" && file.size > MAX_SOURCE_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `That image is ${readable(file.size)}, which is too large for Studio to open on a phone. Export it smaller, or add it from a computer.`,
    };
  }

  /* ── optimize first, then judge what came out ──
     Everything below this point asks its questions about `kept`, not about
     what was selected: the optimized file is the one that goes into IndexedDB
     and across the network, so it is the one the limits are about. */
  let kept = file;
  let optimization: MediaReport | undefined;

  try {
    const outcome = await optimizeForIngest(file, kind, onProgress);
    kept = outcome.file;
    optimization = outcome.report;
  } catch (error) {
    // The only failure worth refusing over: a source too big to process
    // without taking the tab down. Everything else fell back to the original
    // inside the optimizer and never reaches here.
    if (error instanceof MediaTooLargeError) {
      return { ok: false, reason: error.message };
    }
  }

  if (kind === "loop-clip") {
    // Still the gate it always was, now applied to the finished clip — so a
    // MOV that was normalized into an MP4 passes, and one that could not be
    // gets exactly the refusal it got before.
    const clip = await checkClipFile(kept);
    if (!clip.ok) return { ok: false, reason: clip.reason! };
  } else if (kept.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `That file is ${readable(kept.size)}. Keeping something that large on the phone risks pushing your drafts out of storage — upload it from a computer instead.`,
    };
  }

  const report = await storageReport();
  if (report && report.quota > 0 && report.usage + kept.size > report.quota * QUOTA_CEILING) {
    return {
      ok: false,
      reason: `This phone is nearly out of space for the studio (${readable(report.usage)} of ${readable(report.quota)} used). Send what's already waiting before adding another.`,
    };
  }

  onProgress?.({ phase: "storing" });

  const ref = `${PENDING_PREFIX}${newMutationId()}`;
  const stored = await dbPut<PendingMedia>("media", {
    ref,
    kind,
    blob: kept,
    name: kept.name || (kind === "loop-clip" ? "clip.mp4" : "photo"),
    type: kept.type || "application/octet-stream",
    size: kept.size,
    folder: folder.trim() || "hilman",
    capturedAt: new Date().toISOString(),
    attempts: 0,
  });

  if (!stored) {
    return {
      ok: false,
      reason: "This browser would not store the file, so it was not added. Try again with a connection, or from a computer.",
    };
  }

  return { ok: true, ref, report: optimization };
}

export async function listPendingMedia(): Promise<PendingMedia[]> {
  const all = await dbGetAll<PendingMedia>("media");
  return all.sort((a, b) => (a.capturedAt < b.capturedAt ? -1 : 1));
}

export async function discardPendingMedia(ref: string): Promise<void> {
  await dbDelete("media", ref);
}

async function update(ref: string, patch: Partial<PendingMedia>): Promise<void> {
  const entry = (await listPendingMedia()).find((item) => item.ref === ref);
  if (!entry) return;
  await dbPut("media", { ...entry, ...patch });
}

export async function retryPendingMedia(ref: string): Promise<void> {
  const entry = (await listPendingMedia()).find((item) => item.ref === ref);
  if (!entry) return;
  const { lastError: _dropped, ...rest } = entry;
  await dbPut("media", { ...rest, blocked: false });
}

/* ── the upload itself ────────────────────────────────────── */

export interface UploadedAsset {
  public_id: string;
  width?: number;
  height?: number;
  bytes?: number;
  /**
   * The file reached Cloudinary but the media-library row was not written.
   * The asset is usable — it just won't appear in the library until the
   * bookkeeping is retried.
   */
  unrecorded?: string;
}

/**
 * Signed upload:
 * 1. ask our server for a signature (site owner session required)
 * 2. POST the bytes straight to Cloudinary
 * 3. record the asset in the media library
 *
 * Step 3 has its own outcome. It used to be awaited and discarded, so a failed
 * insert produced a file that existed in Cloudinary but nowhere in the CMS.
 */
export async function uploadAsset(
  file: Blob,
  name: string,
  folder = "hilman",
  assetId?: string
): Promise<UploadedAsset> {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, ...(assetId ? { assetId } : {}) }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    // The status travels. Thrown as a bare Error, a 429 and a 415 became the
    // same untyped string and every one of them was treated as permanent.
    throw new UploadError(err.error ?? "Could not sign upload", signRes.status, "sign");
  }
  const {
    cloudName,
    apiKey,
    timestamp,
    signature,
    folder: signedFolder,
    publicId,
  } = await signRes.json();

  const isImage = file.type.startsWith("image/");
  const fd = new FormData();
  fd.append("file", file, name);
  fd.append("api_key", apiKey);
  fd.append("timestamp", String(timestamp));
  fd.append("signature", signature);
  fd.append("folder", signedFolder);
  // Signed above, so this is the id the route agreed to and not one the
  // browser picked. Sending the same one again overwrites rather than
  // creating a second copy of the same photograph.
  if (publicId) fd.append("public_id", publicId);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${isImage ? "image" : "raw"}/upload`,
    { method: "POST", body: fd }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new UploadError(
      `Cloudinary upload failed${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status,
      "transfer"
    );
  }
  const asset = await res.json();

  const uploaded: UploadedAsset = {
    public_id: asset.public_id,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
  };

  const recorded = await recordMedia({
    public_id: asset.public_id,
    kind: isImage ? "image" : "file",
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    folder: signedFolder,
  });
  if (recorded.status === "error") {
    uploaded.unrecorded = recorded.message ?? "Could not add it to the media library.";
  }
  return uploaded;
}

/**
 * Signed upload, R2's shape:
 * 1. ask our server to presign one PUT for this exact size and content-type
 * 2. PUT the bytes straight to that URL
 *
 * There is no step 3. R2 only stores files — no transform pipeline, and no
 * media-library bookkeeping for v1, because nothing yet asks to browse or
 * reuse a previously uploaded clip. What comes back is the finished public
 * URL, not an id a display-time helper still has to resolve: unlike a
 * Cloudinary `public_id`, this is already the value `<video src>` will use.
 */
async function uploadClip(
  file: Blob,
  name: string,
  folder = "clips",
  assetId?: string
): Promise<{ url: string }> {
  const signRes = await fetch("/api/r2/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder,
      filename: name,
      contentType: "video/mp4",
      size: file.size,
      ...(assetId ? { assetId } : {}),
    }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new UploadError(err.error ?? "Could not sign upload", signRes.status, "sign");
  }
  const { uploadUrl, publicUrl } = await signRes.json();

  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "video/mp4" },
  });
  if (!res.ok) {
    throw new UploadError(`Upload to R2 failed (${res.status}).`, res.status, "transfer");
  }

  return { url: publicUrl };
}

export interface MediaFlushReport {
  /**
   * placeholder → the finished reference: a Cloudinary `public_id` for a
   * photo, or a complete https URL for a Loop Clip. `replacePendingRefs()`
   * treats both as an opaque string, so nothing downstream needs to know
   * which shape it received.
   */
  resolved: Record<string, string>;
  /** True when at least one upload failed for a reason worth retrying. */
  offline: boolean;
  /**
   * placeholder → why it is not in the media library, for files the provider
   * accepted but the library row did not record. The reference is correct and
   * the asset is usable; only the bookkeeping is missing.
   */
  unrecorded: Record<string, string>;
}

/**
 * Where the bytes actually go.
 *
 * An interface rather than two direct calls so the lifecycle around them can
 * be tested without a network: what matters here is the *order* of the local
 * writes, and that order is the thing that used to be wrong.
 */
export interface MediaUploader {
  image(file: Blob, name: string, folder: string, assetId?: string): Promise<UploadedAsset>;
  clip(file: Blob, name: string, folder: string, assetId?: string): Promise<{ url: string }>;
}

const liveUploader: MediaUploader = {
  image: (file, name, folder, assetId) => uploadAsset(file, name, folder, assetId),
  clip: (file, name, folder, assetId) => uploadClip(file, name, folder, assetId),
};

/**
 * The stable remote name for a stashed file: the placeholder's own uuid.
 *
 * `pending:<uuid>` is assigned once, when the file is stored on the device,
 * and never changes. Using it as the upload identity means a retry after a
 * lost acknowledgement lands on the same object rather than making another.
 */
const assetIdOf = (ref: string) => ref.slice(PENDING_PREFIX.length).toLowerCase();

/** Test seam for the one write whose refusal must not cost the bytes. */
export interface FlushIo {
  remember?: typeof rememberResolution;
}

/**
 * Sends everything that is waiting, one at a time.
 *
 * Sequentially rather than in parallel: these are photographs on a phone
 * connection, and eight simultaneous uploads on a weak signal is how all eight
 * time out instead of the first three succeeding.
 *
 * ── the order, which is the whole point ──
 *
 *   1. upload the bytes
 *   2. write down where they went   <- durable, survives the app being killed
 *   3. release the local copy
 *
 * It used to be 1, then 3, with the mapping held in a local variable and the
 * documents rewritten by the caller afterwards. Interrupted in between, the
 * bytes were gone and nothing knew the remote id — leaving a placeholder that
 * could never resolve and a queued save held behind it for ever.
 *
 * Step 2 failing is survivable and step 3 is skipped when it does: the local
 * copy is then the only route back to that photograph, so it stays.
 */
export async function flushPendingMedia(
  uploader: MediaUploader = liveUploader,
  io: FlushIo = {}
): Promise<MediaFlushReport> {
  const remember = io.remember ?? rememberResolution;

  // Anything uploaded on a previous run whose paperwork never finished. Its
  // bytes may or may not still be here; either way it does not go up again.
  const carried = await unfinishedResolutions();
  const resolved: Record<string, string> = resolutionMap(carried);
  const unrecorded: Record<string, string> = {};
  for (const item of carried) {
    if (item.unrecorded) unrecorded[item.ref.toLowerCase()] = item.unrecorded;
  }

  const pending = (await listPendingMedia()).filter((item) => !item.blocked);
  let offline = false;

  for (const item of pending) {
    const key = item.ref.toLowerCase();

    // Already uploaded, and we know where to. The interruption was after the
    // upload, so all that is left is to let the bytes go.
    if (resolved[key]) {
      await discardPendingMedia(item.ref);
      continue;
    }

    try {
      const outcome =
        item.kind === "loop-clip"
          ? { reference: (await uploader.clip(item.blob, item.name, item.folder, assetIdOf(item.ref))).url }
          : await (async () => {
              const asset = await uploader.image(item.blob, item.name, item.folder, assetIdOf(item.ref));
              return { reference: asset.public_id, unrecorded: asset.unrecorded };
            })();

      const stored = await remember({
        ref: item.ref,
        resolved: outcome.reference,
        kind: item.kind,
        uploadedAt: new Date().toISOString(),
        ...("unrecorded" in outcome && outcome.unrecorded
          ? { unrecorded: outcome.unrecorded }
          : {}),
      });

      if (!stored) {
        // The file has a remote home and nothing here can remember where.
        // Keeping the bytes is the only way this is recoverable, so they stay
        // and the entry is left retryable rather than blocked.
        await update(item.ref, {
          attempts: item.attempts + 1,
          lastError:
            "Uploaded, but this browser would not record where it went. It is still here and will be sent again.",
        });
        continue;
      }

      resolved[key] = outcome.reference;
      if ("unrecorded" in outcome && outcome.unrecorded) unrecorded[key] = outcome.unrecorded;
      await discardPendingMedia(item.ref);
    } catch (error: unknown) {
      const failure = classifyUploadFailure(error);
      offline ||= failure.offline;

      if (failure.retryable) {
        await update(item.ref, {
          attempts: item.attempts + 1,
          ...(failure.message ? { lastError: failure.message } : {}),
        });
        // No point trying the rest down a wire that is not there.
        if (failure.offline) break;
        continue;
      }
      await update(item.ref, {
        attempts: item.attempts + 1,
        lastError: failure.message,
        blocked: true,
      });
    }
  }

  return { resolved, offline, unrecorded };
}
