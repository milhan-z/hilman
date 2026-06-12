import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/data";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let projects: string[] = [];
  let journal: string[] = [];
  
  try {
    const slugs = await getAllSlugs();
    projects = slugs.projects || [];
    journal = slugs.journal || [];
  } catch (err) {
    console.warn("Failed to fetch slugs for sitemap at build time:", err);
  }

  const statics = ["", "/works", "/journal", "/lab", "/about", "/connect"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly" as const,
  }));
  
  return [
    ...statics,
    ...projects.map((slug) => ({ url: `${base}/works/${slug}` })),
    ...journal.map((slug) => ({ url: `${base}/journal/${slug}` })),
  ];
}
