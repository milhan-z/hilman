import { createHash } from "crypto";

/**
 * Server-only Cloudinary helpers (signed upload / destroy).
 * Never import from client components.
 */

/**
 * Read when asked rather than captured at import.
 *
 * Getters, because a module is evaluated once and cached, and a value frozen
 * at that moment is a value nothing can ever ask a second question about. The
 * practical consequence is that "is Cloudinary configured here" can be tested
 * at all — the branch in destroyAsset() that used to silently return is the
 * one that deleted library rows while every file stayed put, and a constant
 * baked in at import time cannot be exercised both ways in one process.
 */
export const CLOUDINARY = {
  get cloudName() {
    return process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
  },
  get apiKey() {
    return process.env.CLOUDINARY_API_KEY ?? "";
  },
  get apiSecret() {
    return process.env.CLOUDINARY_API_SECRET ?? "";
  },
};

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUDINARY.cloudName && CLOUDINARY.apiKey && CLOUDINARY.apiSecret);
}

// No `cloudinaryServerConfigured` constant any more: a boolean frozen at
// import is exactly the thing this change is undoing, and a value that looks
// like a boolean but is computed lazily is worse than either. Callers ask.

/** Cloudinary signature: sha1 of sorted params + api_secret. */
export function signParams(params: Record<string, string | number>) {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(toSign + CLOUDINARY.apiSecret).digest("hex");
}

/**
 * What happened when we asked Cloudinary to delete something.
 *
 * An explicit answer, because the previous version returned nothing at all:
 *
 *     if (!cloudinaryServerConfigured) return;
 *     …
 *     await fetch(…destroy, { method: "POST", body });
 *
 * Neither branch told the caller anything. A missing configuration looked
 * exactly like a successful delete, and so did a 500, and so did Cloudinary's
 * own `{"result":"not found"}` — which it returns with HTTP 200. The caller
 * then deleted the media row, which was the only record that the remote
 * object existed. The file stayed in Cloudinary for ever with nothing in the
 * CMS pointing at it.
 */
export type AssetDeletion =
  /** Gone, or already gone — either way there is nothing left to clean up. */
  | { status: "deleted" }
  /**
   * We could not establish that it is gone. The bookkeeping row must be kept:
   * it is the only thing that knows this object is out there.
   */
  | { status: "failed"; reason: string };

/**
 * Delete an asset from Cloudinary.
 *
 * "Not found" counts as deleted: the goal is that the object is not there, and
 * it is not there. Everything else — an unreachable API, a 5xx, a refusal, a
 * missing configuration — is a failure the caller has to act on.
 */
export async function destroyAsset(
  publicId: string,
  resourceType: "image" | "raw" = "image"
): Promise<AssetDeletion> {
  if (!cloudinaryConfigured()) {
    // Previously an early `return` indistinguishable from success, which meant
    // an environment without Cloudinary credentials deleted every media row it
    // was asked to while every file stayed exactly where it was.
    return {
      status: "failed",
      reason: "Cloudinary isn't configured in this environment, so nothing could be deleted there.",
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp });
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY.apiKey,
    signature,
  });

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY.cloudName}/${resourceType}/destroy`,
      { method: "POST", body }
    );
  } catch (error) {
    return { status: "failed", reason: `Cloudinary could not be reached: ${String(error)}` };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      status: "failed",
      reason: `Cloudinary answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}.`,
    };
  }

  // An HTTP 200 is not the answer; `result` is. Cloudinary replies 200 with
  // {"result":"not found"} for something it does not have, and 200 with an
  // error body in a few other cases.
  const payload = (await response.json().catch(() => null)) as { result?: string } | null;
  const result = payload?.result ?? "";

  if (result === "ok" || result === "not found") return { status: "deleted" };
  return {
    status: "failed",
    reason: `Cloudinary said "${result || "nothing we understood"}".`,
  };
}
