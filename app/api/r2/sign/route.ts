import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2, r2Client, r2ServerConfigured } from "@/lib/r2-server";
import { checkOwner } from "@/lib/owner";

/**
 * Signed R2 upload (site owner only) — Loop Clip's counterpart to
 * /api/cloudinary/sign.
 *
 * The mechanics differ from Cloudinary on purpose. Cloudinary's signed upload
 * hands out a signature for a form POST it will itself receive; R2 speaks
 * plain S3, so what this hands out is a presigned PUT URL — a single request,
 * good for five minutes, good for exactly the key and content-type it was
 * asked to sign. The browser then PUTs the bytes straight to that URL; this
 * route never sees them.
 *
 * The three checks below (format, size, folder) are enforced here as well as
 * in the browser before stashing, for the same reason the studio always
 * checks twice: the browser is the one part of this an attacker controls, so
 * a signature this route was talked into issuing for a 2GB file or a
 * disallowed content-type is a signature that should never have existed.
 */

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


/**
 * Mirrors MAX_LOOP_CLIP_BYTES in lib/studio-local/media.ts.
 * Kept as a second constant, not an import: this file must not import
 * anything from a "use client" module, and the two are cheap to keep in step
 * by comment.
 */
const MAX_CLIP_BYTES = 50 * 1024 * 1024;

/** v1 accepts exactly one container. See lib/studio-local/clip-check.ts for why. */
const ALLOWED_CONTENT_TYPE = "video/mp4";

export async function POST(request: Request) {
  const owner = await checkOwner();
  if (!owner.ok) {
    const status = owner.reason === "unconfigured" ? 503 : owner.reason === "unauthenticated" ? 401 : 403;
    return NextResponse.json({ error: owner.message }, { status });
  }
  if (!r2ServerConfigured) {
    return NextResponse.json({ error: "Cloudflare R2 not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const folder = String(body.folder ?? "clips").trim() || "clips";
  const contentType = String(body.contentType ?? "");
  const size = Number(body.size);

  if (!FOLDER_PATTERN.test(folder) || folder.includes("..")) {
    return NextResponse.json({ error: "That folder name isn't allowed." }, { status: 400 });
  }
  if (contentType !== ALLOWED_CONTENT_TYPE) {
    return NextResponse.json(
      { error: "Loop Clip only accepts MP4 video for now." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_CLIP_BYTES) {
    return NextResponse.json(
      { error: `That file is too large for a Loop Clip (max ${Math.round(MAX_CLIP_BYTES / (1024 * 1024))} MB).` },
      { status: 400 }
    );
  }

  const assetId = body.assetId;
  const stableId = typeof assetId === "string" && ASSET_ID.test(assetId) ? assetId : null;
  if (assetId !== undefined && !stableId) {
    return NextResponse.json({ error: "That asset id isn't allowed." }, { status: 400 });
  }

  // The same clip PUTs to the same key however many times it is retried, so a
  // lost acknowledgement overwrites rather than accumulating orphans.
  const key = `${folder}/${stableId ?? randomUUID()}.mp4`;
  const command = new PutObjectCommand({
    Bucket: R2.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });

  // Five minutes: long enough for a slow upload to start, short enough that a
  // leaked URL is not a standing invitation.
  const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 300 });

  const isR2Dev = !R2.publicUrl || /\.r2\.dev/i.test(R2.publicUrl);
  const publicUrl = isR2Dev ? `/api/r2/media/${key}` : `${R2.publicUrl}/${key}`;

  return NextResponse.json({
    uploadUrl,
    key,
    publicUrl,
  });
}
