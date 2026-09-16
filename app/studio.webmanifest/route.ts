import type { MetadataRoute } from "next";

/**
 * The Studio's web app manifest.
 *
 * Deliberately *not* `app/manifest.ts`. That file convention links a manifest
 * into every page of the site, so a reader of the public notebook would be
 * offered "install Hilman. Studio" — an admin tool they cannot open. This is a
 * plain route instead, linked only from the admin layout's metadata.
 *
 * `scope` stays at "/" even though the app starts at /admin: the offline shell
 * and the public site both need to open inside the installed window rather
 * than bouncing out to Safari.
 */

const manifest: MetadataRoute.Manifest = {
  id: "/admin",
  name: "Hilman. Studio",
  short_name: "Studio",
  description: "The private desk behind hilman. — write, edit and publish from a phone.",
  start_url: "/admin",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  // Matches --paper / --hl so the splash screen and title bar are the studio's
  // own colours rather than the browser's default white.
  background_color: "#0a0a0a",
  theme_color: "#0a0a0a",
  categories: ["productivity"],
  icons: [
    { src: "/icons/studio-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icons/studio-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icons/studio-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  shortcuts: [
    { name: "Quick draft", short_name: "Draft", url: "/admin?compose=draft" },
    { name: "New project", short_name: "Project", url: "/admin/projects/new" },
    { name: "Journal", short_name: "Journal", url: "/admin/journal" },
  ],
};

// Nothing here varies by request, so it is prerendered and served from the
// edge rather than waking a function every time the app is launched.
export const dynamic = "force-static";

export function GET() {
  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Short, not immutable: the manifest is tiny and changing it is how the
      // installed icon and name get corrected.
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
