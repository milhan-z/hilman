"use client";

import { recordMedia } from "@/app/admin/actions";
import { PENDING_PREFIX } from "../studio-media-refs";
import { dbDelete, dbGetAll, dbPut } from "./db";
import { newMutationId } from "./save";

/**
 * Photographs that exist only on this phone, so far.
 *
 * Uploading is the one part of the studio that genuinely cannot be deferred
 * into a database row: Cloudinary needs the bytes. So the bytes are kept here,
 * as a Blob in IndexedDB, and the block that wants the photo holds a
 * `pending:<uuid>` placeholder until the upload finishes.
 *
 * Two things follow from that, and both are load-bearing:
 *
 *  - The photo is stored *before* anything is attempted over the network, so
 *    the picture survives the app being closed on a train.
 *  - A save whose payload still names a placeholder is held back by the outbox
 *    (see sync.ts), so the site is never asked to show a picture nobody else
 *    can reach.
 */

export interface PendingMedia {
  /** `pending:<uuid>` — the key, and the string blocks actually hold. */
  ref: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  folder: string;
  capturedAt: string;
  attempts: number;
  lastError?: string;
  /** Cloudinary refused it for a reason retrying will not change. */
  blocked?: boolean;
}

export type StashResult =
  | { ok: true; ref: string }
  | { ok: false; reason: string };

/**
 * How much of the browser's storage allowance we are willing to hold.
 *
 * Going over does not fail gracefully: the browser starts evicting, and what
 * it evicts is the same database holding the drafts. Stopping at four fifths
 * leaves room for the text, which is the part that cannot be retaken.
 */
const QUOTA_CEILING = 0.8;

/** Big enough for a phone photo, small enough to notice a video by mistake. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
 */
export async function stashMedia(file: File, folder = "hilman"): Promise<StashResult> {
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `That file is ${readable(file.size)}. Keeping something that large on the phone risks pushing your drafts out of storage — upload it from a computer instead.`,
    };
  }

  const report = await storageReport();
  if (report && report.quota > 0 && report.usage + file.size > report.quota * QUOTA_CEILING) {
    return {
      ok: false,
      reason: `This phone is nearly out of space for the studio (${readable(report.usage)} of ${readable(report.quota)} used). Send the photos that are already waiting before adding another.`,
    };
  }

  const ref = `${PENDING_PREFIX}${newMutationId()}`;
  const stored = await dbPut<PendingMedia>("media", {
    ref,
    blob: file,
    name: file.name || "photo",
    type: file.type || "application/octet-stream",
    size: file.size,
    folder: folder.trim() || "hilman",
    capturedAt: new Date().toISOString(),
    attempts: 0,
  });

  if (!stored) {
    return {
      ok: false,
      reason: "This browser would not store the photo, so it was not added. Try again with a connection, or from a computer.",
    };
  }

  return { ok: true, ref };
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
export async function uploadAsset(file: Blob, name: string, folder = "hilman"): Promise<UploadedAsset> {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not sign upload");
  }
  const { cloudName, apiKey, timestamp, signature, folder: signedFolder } = await signRes.json();

  const isImage = file.type.startsWith("image/");
  const fd = new FormData();
  fd.append("file", file, name);
  fd.append("api_key", apiKey);
  fd.append("timestamp", String(timestamp));
  fd.append("signature", signature);
  fd.append("folder", signedFolder);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/${isImage ? "image" : "raw"}/upload`,
    { method: "POST", body: fd }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudinary upload failed${detail ? `: ${detail.slice(0, 200)}` : ""}`);
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

export interface MediaFlushReport {
  /** placeholder → the real Cloudinary public_id. */
  resolved: Record<string, string>;
  /** True when at least one upload failed for a reason worth retrying. */
  offline: boolean;
}

/**
 * Sends everything that is waiting, one at a time.
 *
 * Sequentially rather than in parallel: these are photographs on a phone
 * connection, and eight simultaneous uploads on a weak signal is how all eight
 * time out instead of the first three succeeding.
 */
export async function flushPendingMedia(): Promise<MediaFlushReport> {
  const pending = (await listPendingMedia()).filter((item) => !item.blocked);
  const resolved: Record<string, string> = {};
  let offline = false;

  for (const item of pending) {
    try {
      const asset = await uploadAsset(item.blob, item.name, item.folder);
      resolved[item.ref.toLowerCase()] = asset.public_id;
      await discardPendingMedia(item.ref);
    } catch (error: any) {
      const message = String(error?.message ?? error);

      // A rejected fetch means no network; anything Cloudinary or our own
      // signing endpoint *answered* is a decision, and repeating it will get
      // the same answer.
      const networkFailure = error instanceof TypeError || /Failed to fetch|NetworkError/i.test(message);
      offline ||= networkFailure;

      if (networkFailure) {
        await update(item.ref, { attempts: item.attempts + 1 });
        // No point trying the rest down a wire that is not there.
        break;
      }
      await update(item.ref, { attempts: item.attempts + 1, lastError: message, blocked: true });
    }
  }

  return { resolved, offline };
}
