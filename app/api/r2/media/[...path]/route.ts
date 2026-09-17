import { NextResponse } from "next/server";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { R2, r2Client, r2ServerConfigured } from "@/lib/r2-server";

/**
 * Emergency / local fallback route for Loop Clips stored in Cloudflare R2.
 *
 * NOTE: For production, using a Cloudflare Custom Domain (e.g. `media.hilman.design`)
 * or a Cloudflare Worker directly bound to R2 is recommended over streaming
 * 20-50 MB video files through Vercel Functions.
 *
 * Security & Performance guards:
 * - Only allows the `clips/` prefix for loop-clip MP4 files.
 * - Rejects directory traversal, null bytes, and arbitrary bucket paths.
 * - Supports HTTP 206 Partial Content (Range requests) for video seeking.
 * - Returns 416 on out-of-bounds or malformed range requests.
 * - HEAD requests query metadata only via HeadObjectCommand without downloading the body.
 * - Immutable caching (`public, max-age=31536000, immutable`) since keys use randomUUID.
 */

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

const ALLOWED_CLIP_FILENAME = /^[a-zA-Z0-9_-]+\.mp4$/i;

function validateAndResolveKey(path: string[]): string | null {
  if (!Array.isArray(path) || path.length !== 2) return null;
  const [folder, filename] = path;

  // Strict restriction: only `clips/*.mp4` is allowed
  if (folder !== "clips") return null;
  if (!filename || filename.includes("\0") || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
    return null;
  }
  if (!ALLOWED_CLIP_FILENAME.test(filename)) {
    return null;
  }

  return `clips/${filename}`;
}

export async function GET(request: Request, context: RouteContext) {
  if (!r2ServerConfigured) {
    return NextResponse.json({ error: "Cloudflare R2 not configured" }, { status: 503 });
  }

  const { path } = await context.params;
  const key = validateAndResolveKey(path);
  if (!key) {
    return NextResponse.json({ error: "Invalid clip path" }, { status: 400 });
  }

  const range = request.headers.get("range") ?? undefined;

  try {
    const command = new GetObjectCommand({
      Bucket: R2.bucket,
      Key: key,
      Range: range,
    });

    const res = await r2Client().send(command);
    const isPartial = Boolean(range && res.ContentRange);
    const status = isPartial ? 206 : 200;

    const headers = new Headers();
    headers.set("Content-Type", res.ContentType || "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    if (res.ContentLength != null) {
      headers.set("Content-Length", String(res.ContentLength));
    }
    if (res.ContentRange) {
      headers.set("Content-Range", res.ContentRange);
    }
    if (res.ETag) {
      headers.set("ETag", res.ETag);
    }
    if (res.LastModified) {
      headers.set("Last-Modified", res.LastModified.toUTCString());
    }

    const bodyStream = (res.Body as any)?.transformToWebStream?.() ?? (res.Body as any);

    return new Response(bodyStream, {
      status,
      headers,
    });
  } catch (error: any) {
    // 416 Range Not Satisfiable
    if (error?.name === "InvalidRange" || error?.$metadata?.httpStatusCode === 416) {
      const head = await r2Client().send(new HeadObjectCommand({ Bucket: R2.bucket, Key: key })).catch(() => null);
      const total = head?.ContentLength != null ? String(head.ContentLength) : "*";
      return new Response(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${total}`,
          "Accept-Ranges": "bytes",
        },
      });
    }

    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    return NextResponse.json(
      { error: "Could not stream media" },
      { status: 500 }
    );
  }
}

export async function HEAD(request: Request, context: RouteContext) {
  if (!r2ServerConfigured) {
    return new Response(null, { status: 503 });
  }

  const { path } = await context.params;
  const key = validateAndResolveKey(path);
  if (!key) {
    return new Response(null, { status: 400 });
  }

  try {
    const res = await r2Client().send(
      new HeadObjectCommand({
        Bucket: R2.bucket,
        Key: key,
      })
    );

    const headers = new Headers();
    headers.set("Content-Type", res.ContentType || "video/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");

    if (res.ContentLength != null) {
      headers.set("Content-Length", String(res.ContentLength));
    }
    if (res.ETag) {
      headers.set("ETag", res.ETag);
    }
    if (res.LastModified) {
      headers.set("Last-Modified", res.LastModified.toUTCString());
    }

    return new Response(null, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    if (error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404) {
      return new Response(null, { status: 404 });
    }
    return new Response(null, { status: 500 });
  }
}
