import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { R2, r2Client, r2ServerConfigured } from "@/lib/r2-server";
import { checkOwner } from "@/lib/owner";
import { planR2Upload, r2PublicUrl } from "@/lib/r2-policy";

/**
 * Signed R2 upload (site owner only) — for Loop Clips and Journal voice
 * notes; the counterpart to /api/cloudinary/sign.
 *
 * The mechanics differ from Cloudinary on purpose. Cloudinary's signed upload
 * hands out a signature for a form POST it will itself receive; R2 speaks
 * plain S3, so what this hands out is a presigned PUT URL — a single request,
 * good for five minutes, good for exactly the key and content-type it was
 * asked to sign. The browser then PUTs the bytes straight to that URL; this
 * route never sees them.
 *
 * The checks (format, size, folder) are enforced here as well as
 * in the browser before stashing, for the same reason the studio always
 * checks twice: the browser is the one part of this an attacker controls, so
 * a signature this route was talked into issuing for a 2GB file or a
 * disallowed content-type is a signature that should never have existed.
 */

// Which folder, which types, how large and which extension are all decided by
// the kind, in lib/r2-policy.ts — the same table the public proxy serves from.
// The browser no longer names a folder; a `folder` it still sends is ignored.

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
  const plan = planR2Upload(body && typeof body === "object" ? body : {}, randomUUID);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });
  const { key, contentType, size } = plan;

  const command = new PutObjectCommand({
    Bucket: R2.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: size,
  });

  // Five minutes: long enough for a slow upload to start, short enough that a
  // leaked URL is not a standing invitation.
  const uploadUrl = await getSignedUrl(r2Client(), command, { expiresIn: 300 });

  const publicUrl = r2PublicUrl(key, R2.publicUrl);

  return NextResponse.json({
    uploadUrl,
    key,
    publicUrl,
  });
}
