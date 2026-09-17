/**
 * Canonical identity and delivery resolution for Loop Clip media.
 *
 * Loop clips are stored in Cloudflare R2 under `clips/<uuid>.mp4`.
 * To avoid locking the database to a specific CDN URL, this module decouples
 * the canonical storage key (`clips/...`) from the delivery URL.
 *
 * Delivery priorities:
 * 1. Cloudflare Custom Domain or Worker (configured in `NEXT_PUBLIC_R2_PUBLIC_URL`
 *    e.g. `https://media.hilman.design` or `https://hilman-media.workers.dev`).
 *    This provides edge caching (up to 512 MB), 0 egress fees, and fast streaming.
 * 2. Fallback Next.js route (`/api/r2/media/clips/...`) when no custom domain/worker
 *    is configured or when testing locally.
 *
 * Note: Cloudflare's default `pub-*.r2.dev` domains are development-only endpoints
 * with variable rate limits and are confirmed inaccessible on tested Indonesian ISPs.
 */

const R2_DEV_PATTERN = /^https?:\/\/pub-[a-z0-9]+\.r2\.dev\/(.+)$/i;
const LOCAL_PROXY_PATTERN = /^\/api\/r2\/media\/(.+)$/i;
const CLIPS_KEY_PATTERN = /^clips\/[a-zA-Z0-9_-]+\.mp4$/i;

/**
 * Extracts the relative R2 object key from a canonical reference or legacy URL.
 * e.g. "r2:clips/123.mp4" -> "clips/123.mp4"
 *      "https://pub-xxx.r2.dev/clips/123.mp4" -> "clips/123.mp4"
 *      "/api/r2/media/clips/123.mp4" -> "clips/123.mp4"
 */
export function extractR2Key(src: string | null | undefined): string | null {
  if (!src || typeof src !== "string") return null;
  const trimmed = src.trim();
  if (trimmed.startsWith("pending:") || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return null;
  }

  if (trimmed.startsWith("r2:")) {
    return trimmed.slice(3).replace(/^\/+/, "");
  }

  const devMatch = trimmed.match(R2_DEV_PATTERN);
  if (devMatch && devMatch[1]) {
    return devMatch[1].replace(/^\/+/, "");
  }

  const localMatch = trimmed.match(LOCAL_PROXY_PATTERN);
  if (localMatch && localMatch[1]) {
    return localMatch[1].replace(/^\/+/, "");
  }

  if (CLIPS_KEY_PATTERN.test(trimmed)) {
    return trimmed;
  }

  // Check if it is an existing worker or custom domain URL pointing to clips/
  const urlMatch = trimmed.match(/^https?:\/\/[^/]+\/(clips\/[a-zA-Z0-9_-]+\.mp4)$/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  return null;
}

/**
 * Gets the configured public delivery base URL for R2 clips.
 * If a custom domain or Cloudflare Worker is provided, uses that.
 * If unset or pointing to `*.r2.dev`, falls back to the local proxy `/api/r2/media`.
 */
export function getR2DeliveryBase(): string {
  const envUrl = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").trim().replace(/\/+$/, "");
  const isCustomDomainOrWorker = envUrl && !/\.r2\.dev/i.test(envUrl);
  return isCustomDomainOrWorker ? envUrl : "/api/r2/media";
}

/**
 * Resolves a loop clip src (whether canonical, legacy r2.dev, or proxy) into
 * the active public delivery URL.
 */
export function resolveLoopClipSrc(src: string | null | undefined): string {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (trimmed.startsWith("pending:") || trimmed.startsWith("blob:") || trimmed.startsWith("data:")) {
    return trimmed;
  }

  const key = extractR2Key(trimmed);
  if (key) {
    const base = getR2DeliveryBase();
    return `${base}/${key}`;
  }

  return trimmed;
}
