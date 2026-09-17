import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SPACING,
  DEFAULT_SPAN,
  SPACING_CLASSES,
  SPACING_VALUES,
  SPAN_CLASSES,
  SPAN_VALUES,
  blockLayoutClasses,
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
