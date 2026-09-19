import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_SPACING,
  DEFAULT_SPAN,
  SPACING_CLASSES,
  SPACING_VALUES,
  SPAN_CLASSES,
  MEDIA_SPAN_CLASS,
  SPAN_VALUES,
  WIDE_BY_DEFAULT,
  blockLayoutClasses,
  defaultSpacingFor,
  normalizeBlockLayout,
  pixelDimension,
  resolveSpacing,
  resolveSpan,
} from "../lib/block-layout";
import { LAYOUT_KEYS } from "../lib/studio-import-reference";

/**
 * Keeping two meanings out of one key.
 *
 * `data.width` used to be read as a pixel number by the image renderer and as
 * a page-width token by the layout, so a block could hand either reader the
 * other one's value. The editor could produce it: choosing "Wide Width" on an
 * image block wrote `width: "wide"`, which reached Cloudinary as `w_wide` and
 * broke the photo.
 *
 * The token is `data.span` now. These tests fix the separation in place: a
 * string naming a span is a span and never a dimension, a number is a
 * dimension and never a span, and content written before the split still
 * renders exactly as it did.
 */

/* ── spans ────────────────────────────────────────────────── */

test("a block gets the span it asks for", () => {
  for (const span of SPAN_VALUES) {
    assert.equal(resolveSpan({ span }), span);
    assert.ok(blockLayoutClasses({ span }).includes(SPAN_CLASSES[span]));
  }
});

test("a block that asks for nothing gets prose", () => {
  assert.equal(resolveSpan({}), DEFAULT_SPAN);
  assert.equal(resolveSpan(null), DEFAULT_SPAN);
  assert.equal(resolveSpan(undefined), DEFAULT_SPAN);
  assert.equal(resolveSpan({ span: "enormous" }), DEFAULT_SPAN);
});

test("spacing is unchanged by any of this", () => {
  for (const spacing of SPACING_VALUES) {
    assert.equal(resolveSpacing({ spacing }), spacing);
    assert.ok(blockLayoutClasses({ spacing }).includes(SPACING_CLASSES[spacing]));
  }
  assert.equal(resolveSpacing({}), DEFAULT_SPACING);
  assert.equal(resolveSpacing({ spacing: "roomy" }), DEFAULT_SPACING);
});

/* ── content written before the split ─────────────────────── */

test("a legacy string width still selects its span, so old content renders the same", () => {
  for (const span of SPAN_VALUES) {
    assert.equal(resolveSpan({ width: span }), span);
    assert.ok(blockLayoutClasses({ width: span }).includes(SPAN_CLASSES[span]));
  }
});

test("span wins over a legacy width, so a normalised block is not overruled", () => {
  assert.equal(resolveSpan({ span: "full", width: "prose" }), "full");
});

test("normalising retires the legacy key and keeps the span it meant", () => {
  assert.deepEqual(normalizeBlockLayout({ width: "wide", alt: "x" }), { span: "wide", alt: "x" });
});

test("normalising keeps an explicit span and drops only the stale width", () => {
  assert.deepEqual(normalizeBlockLayout({ width: "prose", span: "full" }), { span: "full" });
});

test("normalising never touches a pixel width", () => {
  const data = { width: 800, height: 600, public_id: "x" };
  assert.deepEqual(normalizeBlockLayout(data), data);
  assert.equal(normalizeBlockLayout(data), data, "an untouched block is returned as-is");
});

test("normalising leaves a block with no layout keys alone", () => {
  const data = { text: "hello" };
  assert.equal(normalizeBlockLayout(data), data);
});

/* ── the separation itself ────────────────────────────────── */

test("a pixel width is never mistaken for a span", () => {
  assert.equal(resolveSpan({ width: 800 }), DEFAULT_SPAN);
  assert.equal(resolveSpan({ width: 1600, height: 900 }), DEFAULT_SPAN);
  // And the classes it produces are real ones, not an undefined lookup.
  assert.equal(blockLayoutClasses({ width: 800 }), blockLayoutClasses({}));
});

test("a span is never mistaken for a pixel width", () => {
  // This is the bug in one line: "wide" must not reach the image as a size,
  // because it came out the far end as a Cloudinary transform `w_wide`.
  for (const span of SPAN_VALUES) {
    assert.equal(pixelDimension(span, 1600), 1600);
  }
});

test("pixel dimensions pass through, including the numeric strings JSON brings", () => {
  assert.equal(pixelDimension(800, 1600), 800);
  assert.equal(pixelDimension("800", 1600), 800);
  assert.equal(pixelDimension(1, 1600), 1);
});

test("a nonsense dimension falls back rather than reaching the URL builder", () => {
  for (const value of [0, -5, Number.NaN, Infinity, null, undefined, "", "abc", {}, []]) {
    assert.equal(pixelDimension(value, 1600), 1600, `${JSON.stringify(value)} should fall back`);
  }
});

/* ── the keys stay distinct from the ones blocks already own ── */

/**
 * `layout` was the obvious name for the span and is already the gallery's own
 * key for `grid | columns`, on live rows. Taking it would have rebuilt the
 * same fault one block over.
 */
test("the span key does not collide with a key a block already owns", () => {
  const ownedByBlocks = [
    "alt", "caption", "code", "component", "description", "filename", "height",
    "href", "items", "label", "language", "layout", "level", "md", "props",
    "provider", "public_id", "size", "source", "src", "style", "text",
    "thumbnail", "title", "url", "variant", "width", "youtube_id", "html",
  ];
  assert.equal(ownedByBlocks.includes("span"), false, "`span` must stay free");
  assert.ok(ownedByBlocks.includes("layout"), "`layout` is the gallery's, not the page's");
});

/* ── the documentation says what the code does ────────────── */

test("the importer reference offers the keys the renderer actually reads", () => {
  const documented = Object.fromEntries(LAYOUT_KEYS.map((row) => [row.key, row.values]));
  assert.deepEqual(Object.keys(documented).sort(), ["spacing", "span"]);
  assert.equal(documented.span, SPAN_VALUES.join(" | "));
  assert.equal(documented.spacing, SPACING_VALUES.join(" | "));
});

test("every value the reference offers is one the renderer accepts", () => {
  for (const row of LAYOUT_KEYS) {
    for (const value of row.values.split(" | ")) {
      const resolved =
        row.key === "span" ? resolveSpan({ span: value }) : resolveSpacing({ spacing: value });
      assert.equal(resolved, value, `the guide offers ${row.key}: ${value}, which is not accepted`);
    }
  }
});

/* ── text and media stop sharing one column ───────────────── */

/**
 * Measured before this changed: on a 1440px screen every one of an article's
 * 122 blocks came out at exactly 672px — paragraph, gallery and video alike.
 * The same column was simultaneously too wide for 16px text (79 characters a
 * line) and too narrow for a photograph. Splitting them is the fix; these
 * tests are what stop them being re-merged.
 */

test("a photograph gets more room than a paragraph, but only where there is room", () => {
  const media = blockLayoutClasses({}, "image");
  const text = blockLayoutClasses({}, "paragraph");

  // The number itself moved into a custom property so the page can choose it
  // (see the page-context tests below); what matters here is that media gets
  // an lg override at all and prose does not.
  assert.equal(media.includes("lg:max-w-[var(--media-lg)]"), true, "media widens at lg");
  assert.equal(text.includes("lg:max-w-"), false, "prose does not");

  // Below lg they are the same width, because on a phone the column is the
  // screen and there is nothing to widen into.
  assert.equal(media.includes("max-w-prose"), true);
  assert.equal(text.includes("max-w-prose"), true);
});

test("every block type that is looked at rather than read takes the wider default", () => {
  for (const type of ["image", "gallery", "youtube", "loop-clip", "embed", "code"]) {
    assert.equal(WIDE_BY_DEFAULT.has(type), true, type);
    assert.match(blockLayoutClasses({}, type), /lg:max-w-\[var\(--media-lg\)\]/, type);
  }
  for (const type of ["paragraph", "markdown", "quote", "heading", "link", "button"]) {
    assert.equal(WIDE_BY_DEFAULT.has(type), false, type);
    assert.ok(!blockLayoutClasses({}, type).includes("--media-lg"), type);
  }
});

test("an author who chose a span still gets exactly that span", () => {
  // The type-based width is a default, not a ceiling.
  assert.match(blockLayoutClasses({ span: "prose" }, "image"), /max-w-prose mx-auto/);
  assert.ok(!blockLayoutClasses({ span: "prose" }, "image").includes("--media-lg"));
  assert.match(blockLayoutClasses({ span: "full" }, "image"), /max-w-none/);
  assert.match(blockLayoutClasses({ span: "wide" }, "gallery"), /max-w-content/);
});

test("a legacy string width still overrides the media default", () => {
  assert.match(blockLayoutClasses({ width: "full" }, "image"), /max-w-none/);
});

test("a pixel width is not a span and does not stop a photo widening", () => {
  // `width: 1600` is an image's pixel size. It must not be read as a choice
  // of column — that confusion is the bug lib/block-layout.ts exists to end.
  assert.match(blockLayoutClasses({ width: 1600 }, "image"), /lg:max-w-\[var\(--media-lg\)\]/);
});

test("calling without a type behaves exactly as before", () => {
  // Every existing caller keeps working: same prose column, same medium gap.
  assert.equal(blockLayoutClasses({}), blockLayoutClasses({}, undefined));
  assert.match(blockLayoutClasses({}), /max-w-prose/);
  assert.match(blockLayoutClasses({}), /py-4 sm:py-7/);
});

/* ── rhythm follows what a block is ───────────────────────── */

test("prose closes up and media breathes", () => {
  // One gap for everything made an article read as a list of separate
  // announcements: the space between two sentences of one thought was the
  // space between a paragraph and a gallery.
  assert.equal(defaultSpacingFor("paragraph"), "small");
  assert.equal(defaultSpacingFor("markdown"), "small");
  assert.equal(defaultSpacingFor("quote"), "small");
  assert.equal(defaultSpacingFor("image"), "medium");
  assert.equal(defaultSpacingFor("gallery"), "medium");
});

test("a heading brings its own chapter break and is not given a second one", () => {
  // The renderer already puts mt-12/mt-10 on headings; padding on top of that
  // was two systems' idea of a break, stacked.
  assert.equal(defaultSpacingFor("heading"), "none");
  assert.match(blockLayoutClasses({}, "heading"), /py-0/);
});

test("a divider is meant to be felt", () => {
  assert.equal(defaultSpacingFor("divider"), "large");
});

test("an explicit spacing always wins over the type default", () => {
  for (const type of ["paragraph", "image", "heading", "divider"]) {
    assert.equal(resolveSpacing({ spacing: "large" }, type), "large");
    assert.equal(resolveSpacing({ spacing: "none" }, type), "none");
  }
});

test("an unknown block type falls back rather than losing its spacing", () => {
  assert.equal(defaultSpacingFor("something-new"), "small");
  assert.equal(defaultSpacingFor(undefined), "medium");
});

/* ── the reading measure ──────────────────────────────────── */

test("the reading column is sized for the type, not the other way round", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const prose = css.slice(css.indexOf(".prose-h {"), css.indexOf(".prose-h > * + *"));
  // 17px on a phone, 18px from a laptop up: 632px of 18px type is about 70
  // characters a line, where 16px was about 79.
  assert.match(prose, /font-size:\s*1\.0625rem/, "17px base");
  assert.match(css, /@media \(min-width: 1024px\)[\s\S]{0,120}font-size:\s*1\.125rem/, "18px at lg");
  assert.match(prose, /max-width:\s*42rem/, "and the column itself is unchanged");
});

/* ── a page decides how expansive its media is ────────────── */

/**
 * Works and Journal run through the same block engine, and after the width
 * split they were also the same *width* — which meant a case study and a
 * reflective entry still read as one template with different metadata.
 *
 * The lever is two custom properties rather than a forked renderer: the media
 * span reads them, the page sets them. Measured at 1440 after: Works media
 * 960px, Journal media 768px, prose 672px on both.
 */

test("media width is asked for by the page, not baked into the block", () => {
  assert.match(MEDIA_SPAN_CLASS, /lg:max-w-\[var\(--media-lg\)\]/);
  assert.match(MEDIA_SPAN_CLASS, /xl:max-w-\[var\(--media-xl\)\]/);
  // Below lg it is still the prose column, because a phone has nothing to
  // widen into and neither page should differ there.
  assert.match(MEDIA_SPAN_CLASS, /max-w-prose/);
});

test("a case study is expansive and a journal entry is calmer", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf(":root {") + 220);
  assert.match(root, /--media-lg:\s*54rem/, "Works keeps the wide default");
  assert.match(root, /--media-xl:\s*60rem/);

  const intimate = css.slice(css.indexOf('[data-reading="intimate"]'));
  assert.match(intimate.slice(0, 200), /--media-lg:\s*46rem/, "Journal pulls media back in");
  assert.match(intimate.slice(0, 200), /--media-xl:\s*48rem/);
});

test("the journal entry page is the thing that asks for the quieter setting", () => {
  const page = readFileSync(
    new URL("../app/(site)/journal/[slug]/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(page, /data-reading="intimate"/);

  // And the case study does not, so it keeps the default.
  const works = readFileSync(
    new URL("../app/(site)/works/[slug]/page.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!works.includes('data-reading="intimate"'), "Works stays expansive");
});

test("nothing about this forked the block engine", () => {
  // One renderer, one set of block components. The difference is a custom
  // property, not a second code path.
  const renderer = readFileSync(
    new URL("../components/blocks/renderer.tsx", import.meta.url),
    "utf8"
  );
  for (const smell of ["data-reading", "isJournal", "isWorks", "pageKind", "--media-lg"]) {
    assert.ok(!renderer.includes(smell), `renderer must not branch on ${smell}`);
  }
});

/** A file's code, with its prose stripped, so an assertion cannot match a comment. */
const code = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ── a bigger screen must not hand back a smaller thing ───── */

/**
 * Two separate components had the same fault, both found by measuring rather
 * than reading: a wider viewport produced a *smaller* element, because a
 * breakpoint added columns or padding faster than the extra width could pay
 * for them.
 *
 * These are behaviour assertions rather than frozen literals — what is being
 * defended is the direction of the change, not the exact number.
 */

test("project cards keep growing through the tablet range", () => {
  // Measured before: 323px wide at 768 and 289px at 1024, because the third
  // column arrived at `lg`. After moving it to `xl`: 445px at 1024, 371px at
  // 1280 — every step now leaves more room than the old worst case.
  const explorer = code("components/works-explorer.tsx");
  const grid = explorer.slice(explorer.indexOf("grid gap-6"), explorer.indexOf("grid gap-6") + 90);
  assert.match(grid, /sm:grid-cols-2/, "two up once there is room for two");
  assert.match(grid, /xl:grid-cols-3/, "and three only once there is room for three");
  assert.ok(!grid.includes("lg:grid-cols-3"), "not at lg, where the cards shrank");
});

test("a carousel slide is never smaller on a tablet than on a phone", () => {
  // Measured before: 236px at 390 but 228px at 768, because `sm` raised the
  // track padding to 20% while dropping the slide to 60%.
  //
  // The contract is the *absolute* width, not the share of the region. The
  // share has to fall as the region widens — that is what makes a neighbour
  // visible — so an earlier version of this test asserted the wrong property
  // and failed against correct code.
  const carousel = code("components/blocks/gallery/carousel.tsx");
  const pad = Number(carousel.match(/sm:px-\[(\d+)%\]/)![1]);
  const slide = Number(carousel.match(/sm:w-\[(\d+)%\]/)![1]);
  const phonePad = Number(carousel.match(/px-\[(\d+)%\]/)![1]);
  const phoneSlide = Number(carousel.match(/w-\[(\d+)%\]/)![1]);

  const px = (region: number, p: number, w: number) =>
    region * ((100 - 2 * p) / 100) * (w / 100);

  // Region widths the layout actually produces: the prose column at 390, the
  // same at 768, and a Works media column at 1440.
  const atPhone = px(350, phonePad, phoneSlide);
  const atTablet = px(632, pad, slide);
  const atDesktop = px(920, pad, slide);

  assert.ok(atTablet > atPhone, `tablet ${atTablet} must exceed phone ${atPhone}`);
  assert.ok(atDesktop > atTablet, `desktop ${atDesktop} must exceed tablet ${atTablet}`);
  // And a neighbour still has to be visible at every size.
  assert.ok(slide < 100 - 2 * pad + 20, "the slide never fills its track");
});

test("a hand-drawn accent can size itself to the word it underlines", () => {
  // Measured on About at 390: the word was 160px and the accent asked for
  // 260px, so the holder's overflow-hidden cropped 38% of the squiggle.
  const accent = code("components/draw-accent.tsx");
  assert.match(accent, /fluid\s*\?\s*"100%"\s*:\s*width/, "it can fill its holder");
  assert.match(accent, /preserveAspectRatio=\{fluid \? "none" : undefined\}/, "stretching, not cropping");

  const about = readFileSync(new URL("../app/(site)/about/page.tsx", import.meta.url), "utf8");
  assert.match(about, /<DrawAccent[^>]*fluid/, "and About uses it");
});

test("the touch targets of a touch-first experiment are thumb-sized", () => {
  // The Lab tools were 31-36px on a page whose whole point is drawing with a
  // finger. They are 44px on a phone and stay compact once there is a pointer.
  for (const path of ["components/lab/doodle-pad.tsx", "components/lab/ink-field.tsx"]) {
    assert.match(code(path), /min-h-11/, `${path} meets the touch target on a phone`);
  }
});
