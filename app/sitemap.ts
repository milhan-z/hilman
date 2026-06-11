import type { MetadataRoute } from "next";
import { getAllSlugs } from "@/lib/data";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { projects, journal } = await getAllSlugs();
  const statics = ["", "/works", "/journal", "/lab", "/about", "/connect", "/desk"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "weekly" as const,
  }));
  return [
    ...statics,
    ...projects.map((slug) => ({ url: `${base}/works/${slug}` })),
    ...journal.map((slug) => ({ url: `${base}/journal/${slug}` })),
  ];
}
