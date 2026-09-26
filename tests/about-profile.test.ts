import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PAGE_SCHEMAS } from "../components/admin/page-schemas";
import { AboutSheet, aboutPhoto, afterGreeting } from "../components/about-sheet";
import { mockPages } from "../lib/mock";
import { PROFILE_DEFAULTS, resolveProfileData } from "../lib/profile";

/**
 * About, in the style of Hilman's old About Me page — a card clipped to a
 * sheet of linen paper, his photo on a yellow block — and filled with the
 * notebook's own About, each thing said once.
 *
 * The first version of it copied the old page's words as well as its look:
 * a CV summary and contacts on the card, then the notebook's own greeting
 * and introduction again underneath. What is pinned here is that it does
 * not happen again, with the copy the live site actually holds.
 */

const about = PROFILE_DEFAULTS.about;
const page = readFileSync(new URL("../app/(site)/about/page.tsx", import.meta.url), "utf8");
const h = React.createElement;

/** What the live site's About held when the card arrived: saved from the Studio. */
const live = resolveProfileData("about", {
  lede: "I’m Hilman. An Informatics student at ITS, with a soft spot for the creative side of things.",
  story: about.story,
  interests: about.interests,
  personal_note: "The people are part of the story, too.",
  focus: about.focus,
  community_heading: about.community_heading,
  community_story: about.community_story,
});

const sheet = (d: Record<string, any> = live, props: Partial<Parameters<typeof AboutSheet>[0]> = {}) =>
  renderToStaticMarkup(
    h(AboutSheet, {
      photo: { src: "https://images.example/hilman-card.png", alt: d.portrait_alt, cutout: true },
      lede: d.lede,
      interests: d.interests,
      story: d.story,
      note: d.personal_note,
      roles: d.timeline,
      tools: d.toolbox,
      ...props,
    })
  );

const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

test("nothing is said twice, with the copy the live site holds", () => {
  const out = sheet();
  assert.equal(count(out, "Hi, I&#x27;m"), 1, "one greeting");
  assert.ok(!page.includes("Hi, I&apos;m"), "and no second one on the page under the sheet");
  assert.equal(count(out, "Hilman."), 1, "the saved introduction's own \"I’m Hilman.\" is not said again under the greeting");
  assert.equal(count(out, "Informatics student"), 1, "one introduction");
  for (const paragraph of live.story) assert.equal(count(out, paragraph.slice(0, 40)), 1);
  assert.equal(count(out, "part of the story"), 1, "the note once…");
  assert.ok(!/<Kicker>the people are part of the story<\/Kicker>/.test(page), "…because the people section's kicker no longer says it too");
  assert.match(page, /<Kicker>a little more than the work<\/Kicker>/);
});

test("the greeting carries the introduction on, whatever the introduction opens with", () => {
  assert.equal(afterGreeting("I’m Hilman. An Informatics student at ITS."), "An Informatics student at ITS.");
  assert.equal(afterGreeting("I'm Hilman, an Informatics student at ITS."), "An Informatics student at ITS.");
  assert.equal(afterGreeting("I'm Hilman — a student who makes things."), "A student who makes things.");
  assert.equal(afterGreeting("I'm Hilman."), "", "an introduction that was only the name is not shown");
  assert.equal(afterGreeting("I'm Hilman Azhar, and I make things."), "I'm Hilman Azhar, and I make things.", "anything else is shown as written");
  assert.equal(afterGreeting(about.lede), about.lede);
});

test("the card: the photo on its yellow block, the greeting signed in red, and the way on", () => {
  assert.equal(about.portrait_cutout, "hilman/about-portrait-card");
  assert.ok(about.portrait_alt.length > 20, "described for a screen reader");
  const out = sheet();
  assert.match(out, /<svg viewBox="0 0 24 80" fill="none" aria-hidden="true"/, "the paperclip, decoration only");
  assert.match(out, /<div class="relative aspect-\[4\/5\] overflow-hidden bg-hl"><img alt="Hilman from the waist up/);
  assert.match(out, /fetchPriority="high" loading="eager"/, "the page's LCP at every width: asked for first, never lazily");
  assert.match(out, /object-contain object-bottom/, "a cut-out stands on the block rather than being cropped to it");
  assert.match(sheet(live, { photo: { src: "https://images.example/p.jpg", alt: "Hilman", cutout: false } }), /object-cover/, "a plain portrait fills it");
  assert.ok(!sheet(live, { photo: null }).includes("<img"), "and with no photo the card is words alone");
  assert.equal(aboutPhoto({ portrait_cutout: "https://images.example/c.png", portrait: "https://images.example/p.jpg" })?.cutout, true);
  assert.equal(aboutPhoto({}), null);

  assert.match(out, /<h2 id="about-hello"[^>]*>Hi, I&#x27;m <span class="[^"]*font-hand[^"]*text-cream-red[^"]*">Hilman\.<span aria-hidden="true"[^>]*><svg[^>]*class="bits-draw text-hl"/, "Hilman. signed in red, the pen drawing under it");
  assert.match(out, /<p class="[^"]*text-cream-soft[^"]*">An Informatics student at ITS, with a soft spot for the creative side of things\.<\/p>/);
  assert.match(out, /<h3[^>]*>A few things I gravitate towards<\/h3><ul[^>]*>(<li[^>]*><span aria-hidden="true" class="text-cream-red">✦<\/span>[^<]+<\/li>){5}<\/ul>/, "the interests, in the old page's boxed style");
  assert.match(out, /<a class="[^"]*bg-hl text-hl-ink[^"]*" href="\/connect">Let&#x27;s make something<\/a>/);
  assert.match(out, /<a class="[^"]*border-cream-ink text-cream-ink[^"]*" href="\/works">Explore my work<\/a>/, "a ghost button drawn for the paper");
});

test("the sheet: the story in handwriting, the note in red, the experience and the software", () => {
  const out = sheet();
  assert.match(out, /<section aria-labelledby="about-hello" class="paper-linen /, "linen paper, named by the card");
  assert.match(out, /<div class="[^"]*font-hand[^"]*text-cream-ink[^"]*"><p>My days move between/);
  assert.match(out, /<p class="[^"]*font-hand[^"]*text-cream-red[^"]*">The people are part of the story, too\.<\/p>/);
  assert.match(out, /<h3 id="about-experience"[^>]*><span aria-hidden="true" class="absolute[^"]*-z-10"><span class="bits-draw-holder"><span aria-hidden="true" data-trigger="view" class="bits-brush bits-marker text-hl"/, "the marker, waiting for the screen");
  assert.match(out, /<p class="text-sm italic text-cream-soft">July 2023 – July 2024<\/p>/);
  assert.match(out, /Coordinator of Daarul Rahman III Media<\/p><p class="mt-0\.5 text-\[0\.95rem\] text-cream-soft">PonPes Daarul Rahman III Depok<\/p>/);
  for (const [mark, name] of [["Ps", "Photoshop"], ["Ai", "Illustrator"], ["Pr", "Premiere Pro"], ["Ae", "After Effects"], ["Lr", "Lightroom"]]) {
    assert.match(out, new RegExp(`<span aria-hidden="true">${mark}</span><span class="sr-only">${name}</span>`), `${name} is a tile with its name for a screen reader`);
  }
  assert.match(out, /title="Figma"[^>]*><span aria-hidden="true"><svg viewBox="0 0 38 57"/, "Figma wears its mark");
  const withCode = sheet(live, { tools: ["Adobe Photoshop", "Next.js"] });
  assert.match(withCode, /<span class="sr-only">Adobe Photoshop<\/span>/, "an Adobe-prefixed name still finds its tile");
  assert.match(withCode, /<ul aria-label="More software"[^>]*><li[^>]*>Next\.js<\/li><\/ul>/, "anything without a tile is a tag");
});

test("the old page lent its look, not its CV", () => {
  // No summary, contacts, full name or education copied onto the card: the
  // notebook introduces itself, and people reach Hilman through Connect.
  for (const key of ["name", "summary", "contact_email", "instagram", "phone", "details"]) {
    assert.ok(!(key in about), `no ${key} default`);
    assert.ok(!PAGE_SCHEMAS.about.fields.some((f) => f.key === key), `no ${key} field`);
  }
  const out = sheet(about);
  assert.ok(!/mailto:|instagram\.com|wa\.me/.test(out), "no contacts");
  assert.ok(!/over 3 years|Sepuluh Nopember|Muhammad Hilman Azhar|I am an Informatics student/.test(out), "none of its words");
});

test("the page: the old title, the sheet, then the rest of the notebook's About", () => {
  assert.match(page, /<h1[^>]*text-pen[^>]*>About me<\/h1>/);
  assert.match(page, /<span aria-hidden className="h-\[3px\] min-w-8 flex-1 bg-hl" \/>/, "the yellow rule running into it");
  const order = ["<AboutSheet", 'id="focus-heading"', 'id="people"', "<PersonalMoments", 'id="about-connect-heading"'].map((mark) => page.indexOf(mark));
  assert.ok(order.every((at) => at > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in that order");
});

test("the Studio edits every part of it", () => {
  const fields = new Map(PAGE_SCHEMAS.about.fields.map((f) => [f.key, f]));
  for (const key of ["portrait_cutout", "lede", "interests", "story", "personal_note", "timeline", "toolbox", "focus", "community_story", "moments"]) {
    assert.ok(fields.has(key), key);
  }
  assert.match(fields.get("lede")?.hint ?? "", /no need to say your name again/);
  const timeline = fields.get("timeline");
  assert.deepEqual(timeline?.kind === "objectList" && timeline.columns.map((c) => c.key), ["year", "text", "place"]);
  assert.ok(!fields.has("currently"));
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
