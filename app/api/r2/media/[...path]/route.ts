import { NextResponse } from "next/server";
import { R2, r2Client, r2ServerConfigured } from "@/lib/r2-server";
import { serveR2 } from "@/lib/r2-serve";

/**
 * Emergency / local fallback route for Loop Clips and Journal voice notes
 * stored in Cloudflare R2. The work is in lib/r2-serve.ts.
 *
 * NOTE: For production, using a Cloudflare Custom Domain (e.g. `media.hilman.design`)
 * or a Cloudflare Worker directly bound to R2 is recommended over streaming
 * 20-50 MB video files through Vercel Functions.
 *
 * Security & Performance guards:
 * - Only serves what lib/r2-policy.ts allows: `clips/*.mp4` and
 *   `voice-notes/<uuid>.m4a|.mp3`.
 * - Rejects directory traversal, null bytes, and arbitrary bucket paths.
 * - Supports HTTP 206 Partial Content (Range requests) for video seeking.
 * - Returns 416 on out-of-bounds or malformed range requests.
 * - HEAD requests query metadata only via HeadObjectCommand without downloading the body.
 * - Immutable caching (`public, max-age=31536000, immutable`) since keys use randomUUID.
 */

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(request: Request, context: RouteContext) {
  if (!r2ServerConfigured) {
    return NextResponse.json({ error: "Cloudflare R2 not configured" }, { status: 503 });
  }
  const { path } = await context.params;
  return serveR2("GET", request, path, R2.bucket, (command) => r2Client().send(command as never));
}

export async function HEAD(request: Request, context: RouteContext) {
  if (!r2ServerConfigured) {
    return new Response(null, { status: 503 });
  }
  const { path } = await context.params;
  return serveR2("HEAD", request, path, R2.bucket, (command) => r2Client().send(command as never));
}
