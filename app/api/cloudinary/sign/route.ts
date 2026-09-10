import { NextResponse } from "next/server";
import { CLOUDINARY, cloudinaryServerConfigured, signParams } from "@/lib/cloudinary-server";
import { checkOwner } from "@/lib/owner";

/**
 * Signed Cloudinary upload (site owner only).
 *
 * This endpoint hands out credentials to write into the project's asset
 * store, so it applies the same ownership rule as the CMS itself — merely
 * holding a signed-in session is not enough.
 */

/** Folders the signature may be issued for. Keeps the upload inside our tree. */
const FOLDER_PATTERN = /^[a-z0-9][a-z0-9/_-]{0,63}$/i;

export async function POST(request: Request) {
  const owner = await checkOwner();
  if (!owner.ok) {
    const status = owner.reason === "unconfigured" ? 503 : owner.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: owner.message }, { status });
  }
  if (!cloudinaryServerConfigured) {
    return NextResponse.json({ error: "Cloudinary not configured" }, { status: 503 });
  }

  const { folder: requested = "hilman" } = await request.json().catch(() => ({}));
  const folder = String(requested).trim() || "hilman";
  if (!FOLDER_PATTERN.test(folder) || folder.includes("..")) {
    return NextResponse.json({ error: "That folder name isn't allowed." }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { folder, timestamp };
  const signature = signParams(params);

  return NextResponse.json({
    cloudName: CLOUDINARY.cloudName,
    apiKey: CLOUDINARY.apiKey,
    timestamp,
    folder,
    signature,
  });
}
