import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/data";
import { siteUrl } from "@/lib/site";

/**
 * Published content only, regenerated on the same cadence as the pages.
 *
 * The previous version silently fell back to whatever slugs it could get —
 * including the development mock set — so the sitemap advertised URLs that
 * returned 404. Now a failed read produces a sitemap of the static pages
 * only: fewer entries, but no promises the site cannot keep.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const statics = ["", "/works", "/journal", "/lab", "/about", "/connect"].map((p) => ({
    url: `${siteUrl}${p}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
  }));

  let projects: string[] = [];
  let journal: string[] = [];
  try {
    const slugs = await getAllSlugs();
    projects = slugs.projects ?? [];
    journal = slugs.journal ?? [];
  } catch (err: any) {
    console.error(
      "[sitemap] could not read published slugs — listing static pages only:",
      err?.message ?? err
    );
    return statics;
  }

  return [
    ...statics,
    ...projects.map((slug) => ({
      url: `${siteUrl}/works/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
    })),
    ...journal.map((slug) => ({
      url: `${siteUrl}/journal/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
    })),
  ];
}
