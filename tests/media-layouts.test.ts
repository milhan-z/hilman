import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_GALLERY_LAYOUT,
  DEFAULT_IMAGE_LAYOUT,
  DEFAULT_LOOP_CLIP_LAYOUT,
  DEFAULT_YOUTUBE_LAYOUT,
  GALLERY_LAYOUTS,
  IMAGE_LAYOUTS,
  LAYOUT_CHOICES,
  LEGACY_GALLERY_LAYOUT,
  LOOP_CLIP_LAYOUTS,
  YOUTUBE_LAYOUTS,
  hasLayoutChoices,
  resolveGalleryLayout,
  resolveImageLayout,
  resolveLoopClipLayout,
  resolveYouTubeLayout,
  selectedLayoutValue,
} from "../lib/media-layouts";
import { BLOCK_HINTS, type BlockType } from "../lib/types";
import { parseStudioJson, type ImportOutcome } from "../lib/studio-import";
import { convertHtmlToBlocks } from "../lib/studio-import-html";
import { parseMarkdownDocument } from "../lib/studio-import-markdown";

/**
 * Presentation is additive metadata, and this file is the contract that keeps
 * it that way.
 *
 * The premise of the whole feature is that a content type and a presentation
 * are different things: an image is an `image` whether it is framed as a
 * browser window or a polaroid, and nothing in the database learns a new block
 * type. The tests below defend the two properties that follow from that.
 *
 * **Nothing already published moves.** Every block in the live database was
 * written before `layout` existed, except galleries, which have carried one
 * since the beginning. So a missing `layout` has to resolve to the rendering
 * that block already has, and the legacy gallery value `"columns"` has to keep
 * meaning what it means. There is no migration, which means these functions are
 * the only thing standing between old rows and a changed page.
 *
 * **Resolution is total.** `layout` arrives from a JSON document a person or a
 * model wrote, so it can be anything — a typo, a number, a value from a later
 * version of the studio. Every resolver returns a real layout for every input,
 * so the renderer's switch can have a default that renders rather than throws.
 */

/* ── nothing without a layout changes ─────────────────────── */

test("a block with no layout at all gets the presentation it already had", () => {
  // The four defaults *are* the existing rendering. If one of these ever has
  // to change, so does every published page, which is the point of asserting
  // them by name rather than trusting the constant.
  assert.equal(resolveImageLayout({ public_id: "a" }), "default");
  assert.equal(resolveGalleryLayout({ items: [] }), "grid");
  assert.equal(resolveLoopClipLayout({ src: "https://x/y.mp4" }), "default");
  assert.equal(resolveYouTubeLayout({ youtube_id: "abc" }), "default");
});

test("the declared defaults are those same values", () => {
  assert.equal(DEFAULT_IMAGE_LAYOUT, "default");
  assert.equal(DEFAULT_GALLERY_LAYOUT, "grid");
  assert.equal(DEFAULT_LOOP_CLIP_LAYOUT, "default");
  assert.equal(DEFAULT_YOUTUBE_LAYOUT, "default");
});

test("empty, null and undefined data resolve rather than throw", () => {
  for (const data of [undefined, null, {}]) {
    assert.equal(resolveImageLayout(data), DEFAULT_IMAGE_LAYOUT);
    assert.equal(resolveGalleryLayout(data), DEFAULT_GALLERY_LAYOUT);
    assert.equal(resolveLoopClipLayout(data), DEFAULT_LOOP_CLIP_LAYOUT);
    assert.equal(resolveYouTubeLayout(data), DEFAULT_YOUTUBE_LAYOUT);
  }
});

/* ── every declared layout survives the round trip ────────── */

test("each valid layout resolves to itself", () => {
  for (const layout of IMAGE_LAYOUTS) assert.equal(resolveImageLayout({ layout }), layout);
  for (const layout of GALLERY_LAYOUTS) assert.equal(resolveGalleryLayout({ layout }), layout);
  for (const layout of LOOP_CLIP_LAYOUTS) assert.equal(resolveLoopClipLayout({ layout }), layout);
  for (const layout of YOUTUBE_LAYOUTS) assert.equal(resolveYouTubeLayout({ layout }), layout);
});

/* ── anything else falls back, quietly ────────────────────── */

const NONSENSE = [
  "masonry", // a V2 layout, written by an optimistic model
  "Carousel", // right word, wrong case
  "", // an empty string from a form
  "  grid  ", // untrimmed
  42,
  true,
  null,
  undefined,
  {},
  ["grid"],
];

test("an unknown or malformed layout falls back to the default", () => {
  for (const layout of NONSENSE) {
    assert.equal(resolveImageLayout({ layout }), DEFAULT_IMAGE_LAYOUT, `image: ${String(layout)}`);
    assert.equal(
      resolveGalleryLayout({ layout }),
      DEFAULT_GALLERY_LAYOUT,
      `gallery: ${String(layout)}`
    );
    assert.equal(
      resolveLoopClipLayout({ layout }),
      DEFAULT_LOOP_CLIP_LAYOUT,
      `loop-clip: ${String(layout)}`
    );
    assert.equal(
      resolveYouTubeLayout({ layout }),
      DEFAULT_YOUTUBE_LAYOUT,
      `youtube: ${String(layout)}`
    );
  }
});

test("a layout belonging to another block type is not accepted", () => {
  // `polaroid` is an image thing and `cinema` is a YouTube thing. Crossing
  // them would be a way for a typo to silently produce a layout nobody chose.
  assert.equal(resolveGalleryLayout({ layout: "polaroid" }), DEFAULT_GALLERY_LAYOUT);
  assert.equal(resolveImageLayout({ layout: "carousel" }), DEFAULT_IMAGE_LAYOUT);
  assert.equal(resolveLoopClipLayout({ layout: "cinema" }), DEFAULT_LOOP_CLIP_LAYOUT);
  assert.equal(resolveYouTubeLayout({ layout: "phone" }), DEFAULT_YOUTUBE_LAYOUT);
});

/* ── the gallery value that was already in the database ───── */

test('a gallery still holding "columns" keeps it', () => {
  // Four live rows carry `layout`, and one of them is this. It renders two-up,
  // it has always rendered two-up, and nothing in this feature is allowed to
  // quietly turn it into a three-up grid.
  assert.equal(resolveGalleryLayout({ layout: "columns" }), LEGACY_GALLERY_LAYOUT);
});

test('"columns" is not offered in the picker, but reads as Grid there', () => {
  const values = LAYOUT_CHOICES.gallery!.map((choice) => choice.value);
  assert.ok(!values.includes(LEGACY_GALLERY_LAYOUT), "columns is not one of the four");
  assert.equal(selectedLayoutValue("gallery", { layout: "columns" }), "grid");
});

test("the picker shows the stored layout as selected for every type", () => {
  assert.equal(selectedLayoutValue("image", { layout: "polaroid" }), "polaroid");
  assert.equal(selectedLayoutValue("gallery", { layout: "stack" }), "stack");
  assert.equal(selectedLayoutValue("loop-clip", { layout: "phone" }), "phone");
  assert.equal(selectedLayoutValue("youtube", { layout: "cinema" }), "cinema");
  // And the default when there is nothing stored, so no tile is ever blank.
  assert.equal(selectedLayoutValue("image", {}), "default");
  assert.equal(selectedLayoutValue("gallery", {}), "grid");
});

/* ── the picker and the types cannot drift apart ──────────── */

test("exactly the four media types offer a choice", () => {
  const offering = (Object.keys(LAYOUT_CHOICES) as BlockType[]).sort();
  assert.deepEqual(offering, ["gallery", "image", "loop-clip", "youtube"]);
  for (const type of offering) assert.equal(hasLayoutChoices(type), true);
  for (const type of ["paragraph", "heading", "embed", "code"] as BlockType[]) {
    assert.equal(hasLayoutChoices(type), false);
  }
});

test("every layout in a union has a tile, and every tile is a real layout", () => {
  const pairs: [BlockType, readonly string[]][] = [
    ["image", IMAGE_LAYOUTS],
    ["gallery", GALLERY_LAYOUTS],
    ["loop-clip", LOOP_CLIP_LAYOUTS],
    ["youtube", YOUTUBE_LAYOUTS],
  ];
  for (const [type, layouts] of pairs) {
    const values = LAYOUT_CHOICES[type]!.map((choice) => choice.value);
    assert.deepEqual(values, [...layouts], `${type} offers exactly its layouts, in order`);
    for (const choice of LAYOUT_CHOICES[type]!) {
      assert.ok(choice.label.length > 0, `${type}/${choice.value} has a label`);
      assert.ok(choice.detail.length > 0, `${type}/${choice.value} says what it is for`);
    }
  }
});

test("V1 is four gallery presentations and no more", () => {
  // The deferred ones — masonry, scrapbook, film strip, spotlight, and
  // anything automatic — are deliberately absent. This fails loudly if one
  // arrives without the decision being made again.
  assert.deepEqual([...GALLERY_LAYOUTS], ["grid", "carousel", "stack", "accordion"]);
  assert.deepEqual([...IMAGE_LAYOUTS], ["default", "full", "browser", "phone", "polaroid"]);
  assert.deepEqual([...LOOP_CLIP_LAYOUTS], ["default", "browser", "phone", "floating"]);
  assert.deepEqual([...YOUTUBE_LAYOUTS], ["default", "cinema"]);
});

test("no layout is named auto, smart, or anything that picks for you", () => {
  const all = [...IMAGE_LAYOUTS, ...GALLERY_LAYOUTS, ...LOOP_CLIP_LAYOUTS, ...YOUTUBE_LAYOUTS];
  for (const layout of all) {
    assert.ok(!/auto|smart|magic|ai/i.test(layout), `${layout} decides nothing on the author's behalf`);
  }
});

/* ── documents carrying a layout, and documents without one ─ */

const doc = (blocks: unknown[]) =>
  JSON.stringify({ version: 1, kind: "journal", title: "Test", blocks });

const imported = (outcome: ImportOutcome) => {
  assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  return outcome.ok ? outcome.summary.blocks : (null as never);
};

test("Studio JSON keeps a layout it was given", () => {
  const blocks = imported(
    parseStudioJson(
      doc([
        { type: "gallery", data: { layout: "carousel", items: [{ src: "https://x/a.jpg" }] } },
        { type: "image", data: { src: "https://x/b.jpg", layout: "browser" } },
        { type: "youtube", data: { youtube_id: "abc", layout: "cinema" } },
      ]),
      "journal"
    )
  );
  assert.equal(blocks[0].data.layout, "carousel");
  assert.equal(blocks[1].data.layout, "browser");
  assert.equal(blocks[2].data.layout, "cinema");
});

test("Studio JSON does not invent one", () => {
  const blocks = imported(
    parseStudioJson(doc([{ type: "image", data: { src: "https://x/a.jpg", alt: "" } }]), "journal")
  );
  assert.equal("layout" in blocks[0].data, false);
});

test("a document whose layout is nonsense still imports", () => {
  // The importer's job is to accept the document; the renderer's job is to
  // survive it. A bad layout is not a reason to refuse somebody's writing.
  const blocks = imported(
    parseStudioJson(
      doc([{ type: "image", data: { src: "https://x/a.jpg", layout: "hologram" } }]),
      "journal"
    )
  );
  assert.equal(resolveImageLayout(blocks[0].data), "default");
});

/* ── importers describe content, never presentation ───────── */

test("the HTML importer does not guess at a presentation", () => {
  // The alt text says "screenshot of a website", which is exactly the hint a
  // clever importer would take as permission to choose the Browser frame.
  // Presentation is a decision made in the Studio, not one inferred from a
  // sentence somebody wrote for a screen reader.
  const { entries } = convertHtmlToBlocks(
    `<h2>Title</h2><p>Some words.</p><img src="https://x/a.png" alt="A screenshot of a website">`
  );
  assert.ok(
    entries.some((entry) => entry.type === "image"),
    "the photo did arrive"
  );
  for (const entry of entries) {
    assert.equal("layout" in entry.data, false, `${entry.type} arrived without a layout`);
  }
});

test("the Markdown importer does not either", () => {
  const blocks = imported(
    parseMarkdownDocument("## Title\n\nSome words.\n\n![A phone screen](https://x/a.png)\n")
  );
  assert.ok(
    blocks.some((block) => block.type === "image"),
    "the photo did arrive"
  );
  for (const block of blocks) {
    assert.equal("layout" in (block.data ?? {}), false, `${block.type} arrived without a layout`);
  }
});

/* ── what the editor and a model are told ─────────────────── */

test("the block hints describe layout as optional, with its real values", () => {
  for (const [type, layouts] of [
    ["image", IMAGE_LAYOUTS],
    ["gallery", GALLERY_LAYOUTS],
    ["loop-clip", LOOP_CLIP_LAYOUTS],
    ["youtube", YOUTUBE_LAYOUTS],
  ] as [BlockType, readonly string[]][]) {
    const hint = BLOCK_HINTS[type];
    assert.match(hint, /layout\?:/, `${type} marks layout optional`);
    for (const layout of layouts) {
      assert.ok(hint.includes(`'${layout}'`), `${type} hint lists ${layout}`);
    }
  }
});

/* ── the constraints the brief set, held in place ─────────── */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments are prose about the code, not the code. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const GALLERY_SOURCES = [
  "components/blocks/gallery/grid.tsx",
  "components/blocks/gallery/carousel.tsx",
  "components/blocks/gallery/stack.tsx",
  "components/blocks/gallery/accordion.tsx",
];

test("no presentation is randomised, so a page looks the same twice", () => {
  // A random tilt would differ between the server's HTML and the browser's
  // first render — a hydration mismatch React fixes by visibly moving the
  // photograph — and then differ again on every re-render after that.
  for (const path of [...GALLERY_SOURCES, "components/blocks/image-layouts.tsx"]) {
    assert.ok(!code(path).includes("Math.random"), `${path} is deterministic`);
  }
});

test("the accordion can be operated without a pointer", () => {
  const accordion = code("components/blocks/gallery/accordion.tsx");
  assert.match(accordion, /<button/, "each panel is a real button");
  assert.match(accordion, /onClick=/, "and opens on click or tap");
  assert.match(accordion, /aria-pressed/, "which is announced");
  assert.match(accordion, /ArrowRight/, "and the arrow keys move between panels");
});

test("the carousel does not advance by itself", () => {
  const carousel = code("components/blocks/gallery/carousel.tsx");
  assert.ok(!/setInterval|autoplay|autoPlay/i.test(carousel), "nothing rotates on a timer");
  assert.match(carousel, /snap-x/, "the scrolling is the browser's own");
});

test("motion asks whether motion is wanted", () => {
  for (const path of [
    "components/blocks/gallery/carousel.tsx",
    "components/blocks/gallery/stack.tsx",
    "components/blocks/gallery/accordion.tsx",
  ]) {
    assert.match(code(path), /useReducedMotion/, `${path} respects the preference`);
  }
  assert.match(
    code("components/loop-clip-facade.tsx"),
    /motion-reduce:/,
    "and the clip's float settles without animating"
  );
});

test("no animation library was added to do any of this", () => {
  const pkg = JSON.parse(source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of ["gsap", "swiper", "embla-carousel", "embla-carousel-react", "keen-slider"]) {
    assert.equal(banned in deps, false, `${banned} is not a dependency`);
  }
});

test("presentation components know nothing about where the media came from", () => {
  // media-frames.tsx draws a browser window and a phone. If it ever learns
  // what Cloudinary or R2 is, the separation this whole feature rests on has
  // started to leak.
  // code(), not source(): the file's own comment says it knows nothing about
  // Cloudinary, and asserting against the prose would pass or fail on the
  // wording rather than on what the file actually reaches for.
  const frames = code("components/blocks/media-frames.tsx");
  for (const word of ["cloudinary", "supabase", "pending:", "publish"]) {
    assert.ok(!frames.toLowerCase().includes(word), `media-frames.tsx does not mention ${word}`);
  }
});
