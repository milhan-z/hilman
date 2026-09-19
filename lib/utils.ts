export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Re-exported so every existing `import { formatDate } from "@/lib/utils"`
 * keeps working and silently gets the zone-aware version.
 *
 * The implementation moved to lib/dates.ts, where the reason it has to name a
 * time zone is written down next to it — this used to read the date in
 * whatever zone the code happened to run in, which is how one entry came to
 * show two different days on two different pages.
 */
export { formatDate } from "./dates";

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
