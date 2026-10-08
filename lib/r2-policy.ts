import { MAX_VOICE_NOTE_BYTES } from "./voice-note";

/**
 * What may be stored in R2, and where — decided by the server, per kind.
 *
 * The signing route used to take the folder from the request, which made the
 * browser — the one part of this an attacker controls — the authority on
 * where an owner-signed upload lands. Now the browser says only *what kind of
 * thing* it is uploading; this table says which folder, which types, how
 * large, and which extension. The public proxy serves from the same table, so
 * nothing can be signed into a place it will not serve from, or served from a
 * place nothing was meant to be signed into.
 *
 * Pure, with no SDK and no environment, so it is tested on its own.
 */

export type R2UploadKind = "loop-clip" | "voice-note";

interface Policy {
  folder: string;
  maxBytes: number;
  /** content-type → the extension a stored object of that type is given. */
  types: Record<string, string>;
  wrongType: string;
  tooLarge: (maxMB: number) => string;
}

const MB = 1024 * 1024;

export const R2_POLICIES: Record<R2UploadKind, Policy> = {
  "loop-clip": {
    folder: "clips",
    // Mirrors MAX_CLIP_BYTES in lib/studio-local/clip-check.ts.
    maxBytes: 50 * MB,
    types: { "video/mp4": "mp4" },
    wrongType: "Loop Clip only accepts MP4 video for now.",
    tooLarge: (max) => `That file is too large for a Loop Clip (max ${max} MB).`,
  },
  "voice-note": {
    folder: "voice-notes",
    maxBytes: MAX_VOICE_NOTE_BYTES,
    types: { "audio/mp4": "m4a", "audio/mpeg": "mp3" },
    wrongType: "Voice notes take M4A or MP3 recordings.",
    tooLarge: (max) => `This recording is too large. Export it as M4A or MP3 under ${max} MB.`,
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UploadPlan =
  | { ok: true; key: string; contentType: string; size: number }
  | { ok: false; status: 400; error: string };

/**
 * The object a signing request may write, or why it may not.
 *
 * `kind` absent means a Loop Clip: that is what every request said before
 * kinds existed, and a tab still running the old code should keep working.
 * `assetId` is the placeholder's uuid, so a retried upload overwrites the
 * same object instead of leaving one orphan per attempt; `freshId` is used
 * only when there is none.
 */
export function planR2Upload(
  body: { kind?: unknown; contentType?: unknown; size?: unknown; assetId?: unknown },
  freshId: () => string
): UploadPlan {
  const kind = body.kind === undefined ? "loop-clip" : body.kind;
  if (kind !== "loop-clip" && kind !== "voice-note") {
    return { ok: false, status: 400, error: "That kind of upload isn't allowed." };
  }
  const policy = R2_POLICIES[kind];

  const contentType = String(body.contentType ?? "");
  const extension = Object.prototype.hasOwnProperty.call(policy.types, contentType)
    ? policy.types[contentType]
    : null;
  if (!extension) return { ok: false, status: 400, error: policy.wrongType };

  const size = Number(body.size);
  if (!Number.isInteger(size) || size <= 0 || size > policy.maxBytes) {
    return { ok: false, status: 400, error: policy.tooLarge(Math.round(policy.maxBytes / MB)) };
  }

  if (body.assetId !== undefined && !(typeof body.assetId === "string" && UUID.test(body.assetId))) {
    return { ok: false, status: 400, error: "That asset id isn't allowed." };
  }
  const id = typeof body.assetId === "string" ? body.assetId.toLowerCase() : freshId();

  return { ok: true, key: `${policy.folder}/${id}.${extension}`, contentType, size };
}

/* ── serving ─────────────────────────────────────────────── */

const CLIP_FILENAME = /^[a-zA-Z0-9_-]+\.mp4$/i;
const VOICE_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp3)$/;

/**
 * The bucket key a public request may read, with the type to serve it as, or
 * null. Exactly two path segments, a folder from the table, and a filename of
 * that folder's shape — nothing else in the bucket is reachable.
 *
 * Clip filenames stay as permissive as they were, because clips already
 * stored under that rule have to keep playing.
 */
export function servableR2Key(path: unknown): { key: string; contentType: string } | null {
  if (!Array.isArray(path) || path.length !== 2) return null;
  const [folder, filename] = path;
  if (typeof folder !== "string" || typeof filename !== "string") return null;

  if (folder === "clips" && CLIP_FILENAME.test(filename)) {
    return { key: `clips/${filename}`, contentType: "video/mp4" };
  }
  if (folder === "voice-notes" && VOICE_FILENAME.test(filename)) {
    return {
      key: `voice-notes/${filename}`,
      contentType: filename.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4",
    };
  }
  return null;
}

/**
 * Where a visitor's browser fetches a key from.
 *
 * Straight from the bucket's custom domain when there is one. Through this
 * site's own proxy when there is not, or when the configured address is an
 * r2.dev development URL, which is rate-limited and not for production
 * traffic.
 */
export function r2PublicUrl(key: string, publicBase: string): string {
  const base = publicBase.replace(/\/+$/, "");
  return !base || /\.r2\.dev/i.test(base) ? `/api/r2/media/${key}` : `${base}/${key}`;
}
