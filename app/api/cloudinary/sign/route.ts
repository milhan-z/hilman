import { NextResponse } from "next/server";
import { CLOUDINARY, cloudinaryConfigured, signParams } from "@/lib/cloudinary-server";
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

/**
 * A name the same file gets every time it is uploaded.
 *
 * Without one, every attempt asks for a fresh identity, so an upload whose
 * acknowledgement was lost — a phone losing signal at exactly the wrong
 * moment — leaves one object behind for every attempt, and only the last is
 * ever referenced. Deriving it from the placeholder the studio already
 * assigned makes a repeat upload land on the same object instead.
 *
 * Only a UUID is accepted, which is the shape of the placeholder's own id.
 * Anything else could be talked into writing outside the folder.
 */
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;


export async function POST(request: Request) {
  const owner = await checkOwner();
  if (!owner.ok) {
    const status = owner.reason === "unconfigured" ? 503 : owner.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: owner.message }, { status });
  }
  if (!cloudinaryConfigured()) {
    return NextResponse.json({ error: "Cloudinary not configured" }, { status: 503 });
  }

  const { folder: requested = "hilman", assetId } = await request.json().catch(() => ({}));
  const folder = String(requested).trim() || "hilman";
  if (!FOLDER_PATTERN.test(folder) || folder.includes("..")) {
    return NextResponse.json({ error: "That folder name isn't allowed." }, { status: 400 });
  }

  const stableId = typeof assetId === "string" && ASSET_ID.test(assetId) ? assetId : null;
  if (assetId !== undefined && !stableId) {
    return NextResponse.json({ error: "That asset id isn't allowed." }, { status: 400 });
  }

  const timestamp = Math.floor(Date.now() / 1000);
  // `public_id` is part of the signature, so the browser cannot choose a
  // different one than the one this route agreed to.
  const params: Record<string, string | number> = stableId
    ? { folder, public_id: stableId, timestamp }
    : { folder, timestamp };
  const signature = signParams(params);

  return NextResponse.json({
    cloudName: CLOUDINARY.cloudName,
    apiKey: CLOUDINARY.apiKey,
    timestamp,
    folder,
    publicId: stableId,
    signature,
  });
}
