"use client";

import { recordMedia } from "@/app/admin/actions";
import { uploadAsset, type UploadedAsset } from "@/lib/studio-local/media";

export type { UploadedAsset };

/**
 * Upload a file straight to Cloudinary, now.
 *
 * Still the right call for the media library, where the point of the screen is
 * to put files in the library and there is nothing to defer. Content editors
 * go through lib/studio-local/media.ts instead, which keeps the bytes on the
 * device first so a photo taken with no signal is not lost.
 */
export async function uploadToCloudinary(file: File, folder = "hilman"): Promise<UploadedAsset> {
  return uploadAsset(file, file.name, folder);
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
