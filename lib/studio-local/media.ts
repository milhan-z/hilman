"use client";

import { recordMedia } from "@/app/admin/actions";
import { PENDING_PREFIX } from "../studio-media-refs";
import { checkClipFile } from "./clip-check";
import { dbDelete, dbGetAll, dbPut } from "./db";
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
 *
 * A Loop Clip goes through `checkClipFile()` first, which is where a MOV/HEVC
 * export is caught — see lib/studio-local/clip-check.ts for what that check
 * can and cannot promise. Rejected here means it never becomes a Blob in
 * IndexedDB at all, which is the same "refuse, don't half-succeed" rule
 * applied one step earlier than the size/quota checks below.
 */
export async function stashMedia(
  file: File,
  folder = "hilman",
  kind: PendingMediaKind = "image"
): Promise<StashResult> {
  if (kind === "loop-clip") {
    const clip = await checkClipFile(file);
    if (!clip.ok) return { ok: false, reason: clip.reason! };
  } else if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      reason: `That file is ${readable(file.size)}. Keeping something that large on the phone risks pushing your drafts out of storage — upload it from a computer instead.`,
    };
  }

  const report = await storageReport();
  if (report && report.quota > 0 && report.usage + file.size > report.quota * QUOTA_CEILING) {
    return {
      ok: false,
      reason: `This phone is nearly out of space for the studio (${readable(report.usage)} of ${readable(report.quota)} used). Send what's already waiting before adding another.`,
    };
  }

  const ref = `${PENDING_PREFIX}${newMutationId()}`;
  const stored = await dbPut<PendingMedia>("media", {
    ref,
    kind,
    blob: file,
    name: file.name || (kind === "loop-clip" ? "clip.mp4" : "photo"),
    type: file.type || "application/octet-stream",
    size: file.size,
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
async function uploadClip(file: Blob, name: string, folder = "clips"): Promise<{ url: string }> {
  const signRes = await fetch("/api/r2/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder, filename: name, contentType: "video/mp4", size: file.size }),
  });
  if (!signRes.ok) {
    const err = await signRes.json().catch(() => ({}));
    throw new Error(err.error ?? "Could not sign upload");
  }
  const { uploadUrl, publicUrl } = await signRes.json();

  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": "video/mp4" },
  });
  if (!res.ok) {
    throw new Error(`Upload to R2 failed (${res.status}).`);
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
      if (item.kind === "loop-clip") {
        const clip = await uploadClip(item.blob, item.name, item.folder);
        resolved[item.ref.toLowerCase()] = clip.url;
      } else {
        const asset = await uploadAsset(item.blob, item.name, item.folder);
        resolved[item.ref.toLowerCase()] = asset.public_id;
      }
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
