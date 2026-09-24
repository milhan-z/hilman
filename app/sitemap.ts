import type { MetadataRoute } from "next";
import { getAllSlugs, type PublishedEntry } from "@/lib/data";
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

  let projects: PublishedEntry[] = [];
  let journal: PublishedEntry[] = [];
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

  // An entry's own timestamp, not the time the sitemap happened to be built:
  // telling crawlers every page changed within the hour teaches them to
  // ignore the field, and then a real edit is not noticed any sooner.
  const modified = (entry: PublishedEntry) => {
    const time = entry.lastModified ? new Date(entry.lastModified) : null;
    return time && !Number.isNaN(time.getTime()) ? time : now;
  };

  return [
    ...statics,
    ...projects.map((entry) => ({
      url: `${siteUrl}/works/${entry.slug}`,
      lastModified: modified(entry),
      changeFrequency: "monthly" as const,
    })),
    ...journal.map((entry) => ({
      url: `${siteUrl}/journal/${entry.slug}`,
      lastModified: modified(entry),
      changeFrequency: "monthly" as const,
    })),
  ];
}
