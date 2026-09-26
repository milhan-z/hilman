import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PAGE_SCHEMAS } from "../components/admin/page-schemas";
import { AboutSheet, aboutPhoto, contactLinks } from "../components/about-sheet";
import { mockPages } from "../lib/mock";
import { PROFILE_DEFAULTS, resolveProfileData } from "../lib/profile";

/**
 * About, drawn after Hilman's old About Me page: a card clipped to a sheet of
 * linen paper, with his photo on a yellow block, his name signed in red, his
 * details handwritten under it and his experience and software beside it.
 *
 * Production shows these defaults (the seeded demo copy is screened out by
 * resolveProfileData), so they are the page most visitors meet. What is
 * pinned here is what a review of the words alone would miss.
 */

const about = PROFILE_DEFAULTS.about;
const page = readFileSync(new URL("../app/(site)/about/page.tsx", import.meta.url), "utf8");
const h = React.createElement;

const sheet = (props: Partial<Parameters<typeof AboutSheet>[0]> = {}) =>
  renderToStaticMarkup(
    h(AboutSheet, {
      name: about.name,
      summary: about.summary,
      photo: { src: "https://images.example/hilman-card.png", alt: about.portrait_alt, cutout: true },
      email: about.contact_email,
      instagram: about.instagram,
      details: about.details,
      interests: about.interests,
      note: about.personal_note,
      roles: about.timeline,
      tools: about.toolbox,
      ...props,
    })
  );

test("the words are the old About Me page's own", () => {
  assert.equal(about.name, "M Hilman Azhar");
  assert.match(about.summary, /^Informatics student with over 3 years of experience in video editing and graphic design\./);
  assert.deepEqual(about.details, ["Muhammad Hilman Azhar", "Education: Informatics (S1), Sepuluh Nopember Institute of Technology"]);
  assert.match(about.personal_note, /^I am an Informatics student with a strong passion for photography, videography, and graphic design\./);
  assert.deepEqual(
    about.timeline.map((role: { year: string; text: string; place: string }) => [role.year, role.text, role.place]),
    [
      ["July 2023 – July 2024", "Coordinator of Daarul Rahman III Media", "PonPes Daarul Rahman III Depok"],
      ["July 2023 – July 2024", "Islamic Religious Education Teacher", "PonPes Daarul Rahman III Depok"],
      ["June 2021 – June 2023", "Graphic Design and Editing", "Daarul Rahman III Media"],
    ]
  );
  assert.deepEqual(about.toolbox, ["Photoshop", "Illustrator", "Premiere Pro", "After Effects", "Lightroom", "Canva", "Figma"]);
});

test("what the old page printed and a public page should not, it leaves off", () => {
  // A phone number and a date of birth were fine on a PDF sent to someone;
  // on an open web page they are for anyone. The Studio can add them back.
  assert.ok(!("phone" in about), "no phone number by default");
  assert.ok(!about.details.some((line: string) => /birth|\b(19|20)\d{2}\b/i.test(line)), "no date of birth");
  const phone = PAGE_SCHEMAS.about.fields.find((f) => f.key === "phone");
  assert.equal(phone?.kind, "text", "the number is one field away");
  assert.match(phone?.hint ?? "", /anyone can read it/i);
});

test("the photo is the old page's: a cut-out from the waist up, on the card's yellow block", () => {
  assert.equal(about.portrait_cutout, "hilman/about-portrait-card");
  assert.ok(about.portrait_alt.length > 20, "described for a screen reader");
  const out = sheet();
  assert.match(out, /<div class="relative aspect-\[4\/5\] overflow-hidden bg-hl"><img alt="Hilman from the waist up/);
  assert.match(out, /fetchPriority="high" loading="eager"/, "the page's LCP at every width: asked for first, never lazily");
  assert.match(out, /object-contain object-bottom/, "a cut-out stands on the block rather than being cropped to it");
  assert.match(sheet({ photo: { src: "https://images.example/p.jpg", alt: "Hilman", cutout: false } }), /object-cover/, "a plain portrait fills it");
  assert.ok(!sheet({ photo: null }).includes("<img"), "and with no photo the card is words alone");
  // The cut-out wins over the portrait, and either is optional.
  assert.equal(aboutPhoto({ portrait_cutout: "https://images.example/c.png", portrait: "https://images.example/p.jpg" })?.cutout, true);
  assert.equal(aboutPhoto({ portrait: "https://images.example/p.jpg" })?.cutout, false);
  assert.equal(aboutPhoto({}), null);
});

test("the card: a clip, the name signed in red, and contacts that go somewhere", () => {
  const out = sheet();
  assert.match(out, /<svg viewBox="0 0 24 80" fill="none" aria-hidden="true"/, "the paperclip, decoration only");
  assert.match(out, /<h2 id="about-name"[^>]*>M <span class="whitespace-nowrap">Hilman <span class="[^"]*font-hand[^"]*text-cream-red[^"]*">Azhar<\/span><\/span><\/h2>/, "read as one name, the signature never parted from it");
  assert.match(sheet({ name: "Hilman" }), /<h2 id="about-name"[^>]*>Hilman<\/h2>/, "one word is simply the name");
  assert.match(sheet({ name: "Hilman Azhar" }), /<h2 id="about-name"[^>]*><span class="whitespace-nowrap">Hilman <span[^>]*>Azhar<\/span><\/span><\/h2>/);
  assert.match(out, /<a href="mailto:hilmanazhar03@gmail\.com"(?![^>]*target)/, "email opens the mail app, in place");
  assert.match(out, /<a href="https:\/\/www\.instagram\.com\/hilman_azhar\/" target="_blank" rel="noopener noreferrer"/, "Instagram leaves the site in a new tab");
  assert.ok(!out.includes("wa.me"), "no number, no WhatsApp link");
  assert.match(out, /<span class="sr-only">Email: <\/span>/, "each link says what it is to a screen reader");
});

test("a contact is checked before it becomes a link", () => {
  assert.deepEqual(contactLinks({ email: "not an address", instagram: "two words" }), []);
  const [wa] = contactLinks({ phone: "0856-9388-9022" });
  assert.equal(wa.href, "https://wa.me/6285693889022", "a local number is dialled from Indonesia");
  assert.equal(wa.text, "0856-9388-9022", "and shown as it was typed");
  assert.equal(contactLinks({ phone: "+62 856-9388-9022" })[0].href, "https://wa.me/6285693889022");
  assert.equal(contactLinks({ instagram: "https://instagram.com/hilman_azhar?igsh=abc" })[0].text, "@hilman_azhar", "a pasted profile link is read as its handle");
  assert.equal(contactLinks({ instagram: "@hilman_azhar" })[0].href, "https://www.instagram.com/hilman_azhar/");
});

test("the sheet: red details, a handwritten paragraph, a timeline and the software", () => {
  const out = sheet();
  assert.match(out, /<section aria-labelledby="about-name" class="paper-linen /, "linen paper, named by the card");
  assert.match(out, /text-cream-red[^"]*"><li>Muhammad Hilman Azhar<\/li><li>Education: [^<]+<\/li><li>Interests: Design · Film &amp; photo · Motion · Code · Meeting people<\/li><\/ul>/);
  assert.match(out, /font-hand[^"]*text-cream-ink[^"]*">I am an Informatics student/);
  // The highlighted headings are the marker, waiting for the screen like every line.
  assert.match(out, /<h3 id="about-experience"[^>]*><span aria-hidden="true" class="absolute[^"]*-z-10"><span class="bits-draw-holder"><span aria-hidden="true" data-trigger="view" class="bits-brush bits-marker text-hl"/);
  assert.match(out, /<ol aria-labelledby="about-experience"/);
  assert.match(out, /<p class="text-sm italic text-cream-soft">July 2023 – July 2024<\/p>/);
  assert.match(out, /Coordinator of Daarul Rahman III Media<\/p><p class="mt-0\.5 text-\[0\.95rem\] text-cream-soft">PonPes Daarul Rahman III Depok<\/p>/);
  assert.match(out, /<ul aria-labelledby="about-software"/);
  for (const [mark, name] of [["Ps", "Photoshop"], ["Ai", "Illustrator"], ["Pr", "Premiere Pro"], ["Ae", "After Effects"], ["Lr", "Lightroom"]]) {
    assert.match(out, new RegExp(`<span aria-hidden="true">${mark}</span><span class="sr-only">${name}</span>`), `${name} is a tile with its name for a screen reader`);
  }
  assert.match(out, /title="Figma"[^>]*><span aria-hidden="true"><svg viewBox="0 0 38 57"/, "Figma wears its mark");
  const withCode = sheet({ tools: ["Adobe Photoshop", "Next.js"] });
  assert.match(withCode, /<span class="sr-only">Adobe Photoshop<\/span>/, "an Adobe-prefixed name still finds its tile");
  assert.match(withCode, /<ul aria-label="More software"[^>]*><li[^>]*>Next\.js<\/li><\/ul>/, "anything without a tile is a tag");
});

test("the page: the old title, the sheet, then the story it had before", () => {
  assert.match(page, /<h1[^>]*text-pen[^>]*>About me<\/h1>/);
  assert.match(page, /<span aria-hidden className="h-\[3px\] min-w-8 flex-1 bg-hl" \/>/, "the yellow rule running into it");
  const order = ["<AboutSheet", 'id="story-heading"', 'id="focus-heading"', 'id="people"', "<PersonalMoments", 'id="about-connect-heading"'].map((mark) => page.indexOf(mark));
  assert.ok(order.every((at) => at > 0), String(order));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "in that order");
  assert.match(page, /Hi, I&apos;m <span className="relative inline-block">Hilman\./, "the greeting opens the story");
  assert.match(page, /<Kicker>the people are part of the story<\/Kicker>/);
});

test("the Studio edits every part of it", () => {
  const fields = new Map(PAGE_SCHEMAS.about.fields.map((f) => [f.key, f]));
  for (const key of ["portrait_cutout", "name", "summary", "contact_email", "instagram", "phone", "details", "personal_note", "timeline", "toolbox"]) {
    assert.ok(fields.has(key), key);
  }
  const timeline = fields.get("timeline");
  assert.deepEqual(timeline?.kind === "objectList" && timeline.columns.map((c) => c.key), ["year", "text", "place"]);
  assert.ok(!fields.has("currently"), "the old page had nothing like it, and neither does this one");
});

test("the seeded demo copy still gives way to these defaults, and the Studio still wins", () => {
  const seed = mockPages.find((p) => p.slug === "about")!.data;
  const shown = resolveProfileData("about", seed);
  assert.equal(shown.lede, undefined, "the seed's invented lede is screened out, and nothing replaces it");
  assert.deepEqual(shown.timeline, about.timeline);
  assert.deepEqual(shown.toolbox, about.toolbox);
  assert.equal(shown.portrait_cutout, about.portrait_cutout);
  assert.notEqual(shown.portrait, seed.portrait, "the seed's stock portrait is screened out");
  const custom = resolveProfileData("about", { toolbox: ["Figma"], portrait_cutout: "", instagram: "" });
  assert.deepEqual(custom.toolbox, ["Figma"], "a toolbox written in the Studio replaces the default");
  assert.equal(custom.portrait_cutout, "", "and a cut-out removed there stays removed");
  assert.equal(custom.instagram, "", "as does a contact");
});
