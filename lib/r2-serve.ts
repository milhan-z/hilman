import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { servableR2Key } from "./r2-policy";

/**
 * Streaming Loop Clips and voice notes out of R2 — the body of
 * /api/r2/media/[...path], kept here so it can be exercised with a stand-in
 * client (a route file may only export its handlers).
 *
 * - Only keys that lib/r2-policy.ts says are servable: two segments, a known
 *   folder, a filename of that folder's shape. Traversal, NUL bytes and the
 *   rest of the bucket never get as far as R2.
 * - HTTP Range is passed straight through, so a player can seek and stream
 *   without downloading the whole file: 206 with Content-Range, 416 with
 *   `bytes *\/total` when the range is out of bounds.
 * - HEAD reads metadata only.
 * - Content-Type comes from the allowlist, never from what R2 stored.
 * - Immutable caching: keys are uuids, and an object is never rewritten with
 *   different content.
 */

/** The one method this needs from an S3Client. */
export type R2Send = (command: GetObjectCommand | HeadObjectCommand) => Promise<any>;

const CACHE = "public, max-age=31536000, immutable";

export async function serveR2(
  method: "GET" | "HEAD",
  request: Request,
  path: unknown,
  bucket: string,
  send: R2Send
): Promise<Response> {
  const served = servableR2Key(path);
  if (!served) {
    return method === "HEAD"
      ? new Response(null, { status: 400 })
      : Response.json({ error: "Invalid media path" }, { status: 400 });
  }
  const { key, contentType } = served;

  if (method === "HEAD") {
    try {
      const res = await send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return new Response(null, { status: 200, headers: headersFor(res, contentType) });
    } catch (error: any) {
      const status = isNotFound(error) ? 404 : 500;
      return new Response(null, { status });
    }
  }

  const range = request.headers.get("range") ?? undefined;
  try {
    const res = await send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range }));
    const headers = headersFor(res, contentType);
    if (res.ContentRange) headers.set("Content-Range", res.ContentRange);
    const status = range && res.ContentRange ? 206 : 200;
    const body = res.Body?.transformToWebStream?.() ?? res.Body ?? null;
    return new Response(body, { status, headers });
  } catch (error: any) {
    if (error?.name === "InvalidRange" || error?.$metadata?.httpStatusCode === 416) {
      const head = await send(new HeadObjectCommand({ Bucket: bucket, Key: key })).catch(() => null);
      const total = head?.ContentLength != null ? String(head.ContentLength) : "*";
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${total}`, "Accept-Ranges": "bytes" },
      });
    }
    if (isNotFound(error)) return Response.json({ error: "Media not found" }, { status: 404 });
    return Response.json({ error: "Could not stream media" }, { status: 500 });
  }
}

function headersFor(res: any, contentType: string): Headers {
  const headers = new Headers();
  // Always the type the folder and extension imply, never the stored one. A
  // presigned PUT binds the length but not the type, so whatever R2 recorded
  // is whatever the uploader said — and this is served from the site's own
  // origin, where `text/html` would render.
  headers.set("Content-Type", contentType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", CACHE);
  if (res.ContentLength != null) headers.set("Content-Length", String(res.ContentLength));
  if (res.ETag) headers.set("ETag", res.ETag);
  if (res.LastModified instanceof Date) headers.set("Last-Modified", res.LastModified.toUTCString());
  return headers;
}

const isNotFound = (error: any) =>
  error?.name === "NoSuchKey" || error?.name === "NotFound" || error?.$metadata?.httpStatusCode === 404;
