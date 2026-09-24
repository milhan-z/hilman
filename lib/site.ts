/**
 * The site's own address.
 *
 * Every absolute URL the site publishes — metadataBase, og:image,
 * twitter:image, robots.txt, sitemap.xml — is built from this. When it was
 * read straight from NEXT_PUBLIC_SITE_URL with a localhost default, a
 * production build that forgot the variable published
 * `http://localhost:3000/...` to crawlers and social previews.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL      — the deliberate answer; set this.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — the project's stable production host.
 *   3. VERCEL_URL                — this specific deployment (preview builds).
 *   4. http://localhost:3000     — local development only.
 */

function normalise(value: string | undefined, assumeHttps = false): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `${assumeHttps ? "https" : "http"}://${raw}`;
  try {
    const url = new URL(withScheme);
    return url.origin;
  } catch {
    return null;
  }
}

const explicit = normalise(process.env.NEXT_PUBLIC_SITE_URL);
const vercelProduction = normalise(process.env.VERCEL_PROJECT_PRODUCTION_URL, true);
const vercelDeployment = normalise(process.env.VERCEL_URL, true);

export const siteUrl =
  explicit ?? vercelProduction ?? vercelDeployment ?? "http://localhost:3000";

/** True when a production build is about to publish a localhost URL. */
export const siteUrlIsPlaceholder =
  process.env.NODE_ENV === "production" && siteUrl.includes("localhost");

if (siteUrlIsPlaceholder) {
  console.warn(
    "[site] NEXT_PUBLIC_SITE_URL is not set in this production build — " +
      "metadata, robots.txt and sitemap.xml will point at localhost. " +
      "Set it to the public domain and redeploy."
  );
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, siteUrl).toString();
}

export const SITE_NAME = "Hilman.";

/**
 * The share card every page falls back to — app/opengraph-image.tsx.
 *
 * A page that sets its own `openGraph` replaces the layout's whole object
 * (Next merges metadata shallowly), and with it the image the file
 * convention attached. So a detail page without a cover names this one
 * explicitly, rather than going out with no picture at all.
 */
export const DEFAULT_SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Hilman — Design, media & code",
};
