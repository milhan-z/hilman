"use client";

import { recordMedia } from "@/app/admin/actions";

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
 * Client-side signed upload:
 * 1. ask our server for a signature (site owner session required)
 * 2. POST the file straight to Cloudinary
 * 3. record the asset in the media library
 *
 * Step 3 has its own outcome. It used to be awaited and discarded, so a failed
 * insert produced a file that existed in Cloudinary but nowhere in the CMS.
 */
export async function uploadToCloudinary(file: File, folder = "hilman"): Promise<UploadedAsset> {
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
  fd.append("file", file);
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

/** Retry only the media-library bookkeeping for an already-uploaded asset. */
export async function retryRecordMedia(asset: {
  public_id: string;
  kind: "image" | "file";
  format?: string;
  width?: number;
  height?: number;
  bytes?: number;
  folder?: string;
}) {
  return recordMedia(asset);
}
