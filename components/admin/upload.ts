"use client";

import { recordMedia } from "@/app/admin/actions";

/**
 * Client-side signed upload:
 * 1. ask our server for a signature (admin session required)
 * 2. POST the file straight to Cloudinary
 * 3. record the asset in the media library
 */
export async function uploadToCloudinary(file: File, folder = "hilman") {
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
  if (!res.ok) throw new Error("Cloudinary upload failed");
  const asset = await res.json();

  await recordMedia({
    public_id: asset.public_id,
    kind: isImage ? "image" : "file",
    format: asset.format,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    folder: signedFolder,
  });
  return asset as { public_id: string; width?: number; height?: number; bytes?: number };
}
