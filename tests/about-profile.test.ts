import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PAGE_SCHEMAS } from "../components/admin/page-schemas";
import { mockPages } from "../lib/mock";
import { PROFILE_DEFAULTS, resolveProfileData } from "../lib/profile";

/**
 * The About page as it reads before anything is changed in the Studio.
 *
 * Production shows these defaults (the seeded demo copy is screened out by
 * resolveProfileData), so they are the page most visitors meet. What is
 * pinned here is what a review of the words alone would miss.
 */

const about = PROFILE_DEFAULTS.about;
const page = readFileSync(new URL("../app/(site)/about/page.tsx", import.meta.url), "utf8");

test("the lede carries on from the heading instead of repeating the name", () => {
  // The heading is "Hi, I'm Hilman." — the lede used to open "I'm Hilman." again.
  assert.match(page, /Hi, I&apos;m <span[^>]*>Hilman\./);
  assert.ok(!/^I[’']m Hilman/.test(about.lede), about.lede);
  assert.match(about.lede, /Informatics student at ITS/);
});

test("the personal note no longer repeats the people section's kicker", () => {
  assert.match(page, /<Kicker>the people are part of the story<\/Kicker>/);
  assert.ok(!/people are part of the story/i.test(about.personal_note), about.personal_note);
});

test("the portrait is the cut-out, and the Studio can change it", () => {
  assert.equal(about.portrait_cutout, "hilman/about-portrait-sticker");
  assert.ok(about.portrait_alt.length > 20, "described for a screen reader");
  const field = PAGE_SCHEMAS.about.fields.find((f) => f.key === "portrait_cutout");
  assert.equal(field?.kind, "media", "a media field in the Studio, next to the portrait");
  // Shown as a sticker when it is there, the framed print or the note card otherwise.
  assert.match(page, /\{hasCutout \? \(/);
  assert.match(page, /\) : hasPortrait \? \(/);
  assert.match(page, /src=\{d\.portrait_cutout\}\s+alt=\{d\.portrait_alt \|\| "Hilman"\}/);
  // On the first screen at desktop widths, below it on a phone: fetched as
  // soon as the HTML names it, without a preload (measured: +48 ms desktop
  // LCP instead of +152 ms lazy; phone LCP unchanged).
  assert.match(page, /loading="eager"/);
});

test("nothing is invented: no years the site cannot show, tools it is built with", () => {
  // The seed this replaces claimed a 2020 paid poster, a year filming small
  // businesses, a Warung follow-up. None of it was true.
  const years = about.timeline.map((item: { year: string }) => item.year);
  for (const year of years) assert.ok(["Now", "2026", "Along the way"].includes(year), year);
  assert.match(about.timeline[1].text, /Hilman Studio/, "2026 is the year the published Hilman Studio work gives");
  const stack = ["Next.js", "TypeScript", "Tailwind CSS", "Supabase", "Cloudinary", "Cloudflare R2", "Vercel"];
  assert.deepEqual(about.toolbox, stack, "the stack this notebook is built with, and nothing else");
  assert.equal(about.currently.length, 3);
});

test("the seeded demo copy still gives way to these defaults, and the Studio still wins", () => {
  const seed = mockPages.find((p) => p.slug === "about")!.data;
  const shown = resolveProfileData("about", seed);
  assert.equal(shown.lede, about.lede);
  assert.deepEqual(shown.timeline, about.timeline);
  assert.deepEqual(shown.toolbox, about.toolbox);
  assert.equal(shown.portrait_cutout, about.portrait_cutout);
  assert.notEqual(shown.portrait, seed.portrait, "the seed's stock portrait is screened out");
  const custom = resolveProfileData("about", { toolbox: ["Figma"], portrait_cutout: "" });
  assert.deepEqual(custom.toolbox, ["Figma"], "a toolbox written in the Studio replaces the default");
  assert.equal(custom.portrait_cutout, "", "and a cut-out removed there stays removed");
});
