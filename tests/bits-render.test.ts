import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorialReveal, revealStagger } from "../components/bits/editorial-reveal";
import { HandDrawnReveal, PEN_SHAPES } from "../components/bits/hand-drawn-reveal";
import { PaperCard, paperTilt } from "../components/bits/paper-card";
import { PhotoStack } from "../components/bits/photo-stack";
import { Tally, tallyRuns } from "../components/bits/tally";
import { cssDuration } from "../components/bits/tokens";
import { WorkTransition, workHeaderStyle, workPhotoName } from "../components/bits/work-transition";
import { BlockRenderer } from "../components/blocks/renderer";
import { settleDelay } from "../components/bits/pile";
import { PersonalMoments, momentItems } from "../components/personal-moments";
import { formatReaders } from "../lib/readers";
import type { Block } from "../lib/types";

/**
 * What the HILMAN BITS primitives send from the server, before any script
 * has run.
 *
 * The rule that matters most, and the easiest to break without noticing, is
 * that the page is finished in the HTML: content is there and visible, and
 * any entrance is something the browser adds on top. An animation library
 * that renders `opacity: 0` on the server and waits for JavaScript to undo it
 * passes every visual review on a fast laptop and fails every slow phone —
 * which is why these render the real components with react-dom/server, the
 * same path a request takes.
 */

const h = React.createElement;
const html = (element: React.ReactElement) => renderToStaticMarkup(element);

/* ── HandDrawnReveal ──────────────────────────────────────── */

test("every shape DrawAccent had is still there", () => {
  assert.deepEqual(PEN_SHAPES, [
    "underline",
    "underline2",
    "scribble",
    "wave",
    "zigzag",
    "arrow",
    "circle",
    "bracket",
  ]);
});

test("a drawn line is decoration, uncovered by a mask that measures 1", () => {
  for (const variant of PEN_SHAPES) {
    const out = html(h(HandDrawnReveal, { variant }));
    assert.match(out, /^<svg[^>]*aria-hidden="true"/, `${variant} is hidden from assistive technology`);
    const id = out.match(/<mask id="([^"]+)" maskUnits="userSpaceOnUse"/)?.[1];
    assert.ok(id, `${variant} has a mask in the box's own units`);
    assert.match(out, /<path[^>]*class="bits-draw-ink"[^>]*pathLength="1"/, `${variant}: the mask's path is the one that measures 1`);
    const visible = out.match(/<path(?![^>]*bits-draw-ink)[^>]*>/)?.[0] ?? "";
    assert.ok(visible.includes(`mask="url(#${id})"`), `${variant}: the line is seen through its own mask`);
    assert.match(visible, /stroke="currentColor"/, `${variant} takes its colour from its tone`);
    assert.match(visible, /vector-effect="non-scaling-stroke"/, `${variant} keeps its pen weight when stretched`);
    assert.ok(!visible.includes("pathLength"), `${variant}: the visible line is never dashed`);
  }
});

test("two lines on one page never share a mask", () => {
  // A fixed id would have the second line drawn by the first one's mask —
  // React Bits' StickerPeel collides exactly like this with its SVG filter.
  const out = html(h("div", null, h(HandDrawnReveal, {}), h(HandDrawnReveal, {})));
  const ids = [...out.matchAll(/<mask id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
});

test("the mask is wide enough to cover the pen at any scale", () => {
  // /works: 4px at 0.75 scale is 5.3 units of line; the mask gives 2.5 times that.
  const works = html(h(HandDrawnReveal, { width: 150, strokeWidth: 4 }));
  assert.match(works, /class="bits-draw-ink" stroke="white" stroke-width="13.3"/);
  // Fluid: only the height is known, 13px for a 14-unit box.
  const fluid = html(h(HandDrawnReveal, { fluid: true, strokeWidth: 4 }));
  assert.match(fluid, /class="bits-draw-ink" stroke="white" stroke-width="10.8"/);
});

test("the titles draw exactly what DrawAccent drew", () => {
  // /works: 150 wide, a 4px pen, the plain underline, 0.2s in, 0.9s long.
  const out = html(h(HandDrawnReveal, { variant: "underline", width: 150, strokeWidth: 4 }));
  assert.match(out, /width="150" height="11"/, "150 × 14/200, rounded as before");
  assert.match(out, /viewBox="0 0 200 14"/);
  assert.match(out, /stroke-width="4"/);
  assert.match(out, /class="bits-draw text-pen"/, "yellow was var(--pen), and pen is the default tone");
  assert.match(out, /--bits-draw-delay:200ms/, "the same 0.2s before the pen starts");
  assert.ok(!out.includes("--bits-draw-duration"), "and --motion-draw's 900ms, DrawAccent's 0.9s");

  const lab = html(h(HandDrawnReveal, { variant: "circle", tone: "cyan", width: 120, strokeWidth: 3 }));
  assert.match(lab, /width="120" height="36" viewBox="0 0 200 60"/, "the circle keeps its tall box");
  assert.match(lab, /text-cyan/);
});

test("a fluid line stretches to the word it is under", () => {
  const out = html(h(HandDrawnReveal, { variant: "underline2", fluid: true }));
  assert.match(out, /width="100%"/);
  assert.match(out, /preserveAspectRatio="none"/);
});

test("a line that waits for the screen is still sent finished", () => {
  const out = html(h(HandDrawnReveal, { trigger: "view", tone: "hl" }));
  assert.match(out, /^<span class="bits-draw-holder">/, "held by InView");
  assert.ok(!out.includes("data-bits-view"), "no waiting state in the HTML: with no script, the line is simply there");
  assert.match(out, /data-trigger="view"/);
  assert.match(out, /text-hl/, "the highlighter, bright in both themes");
});

test("the brush is Home's stroke: a plain, hidden element the stylesheet sweeps", () => {
  const out = html(h(HandDrawnReveal, { variant: "brush", tone: "hl", delay: 500, duration: 700 }));
  assert.equal(
    out,
    '<span aria-hidden="true" data-trigger="load" class="bits-brush text-hl" style="--bits-draw-delay:500ms;--bits-draw-duration:700ms"></span>'
  );
  const waiting = html(h(HandDrawnReveal, { variant: "brush", trigger: "view" }));
  assert.match(waiting, /^<span class="bits-draw-holder"><span aria-hidden="true" data-trigger="view" class="bits-brush text-pen"/);
  assert.ok(!waiting.includes("data-bits-view"), "sent finished, like every line");
  assert.ok(!out.includes("<svg"), "no SVG and no mask: nothing to repaint while it sweeps");
});

test("the brush is the bar Home always had, swept rather than painted", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  const frame = css.match(/\.bits-brush \{([^}]*)\}/)?.[1] ?? "";
  assert.match(frame, /height: 0\.045em;/, "the old bar's weight, in em so it follows the heading");
  assert.match(frame, /rotate: -2deg;/, "and its tilt, about the centre as before");
  const ink = css.match(/\.bits-brush::before \{([^}]*)\}/)?.[1] ?? "";
  assert.match(ink, /border-radius: 50%;/, "tapered at both ends");
  assert.match(ink, /transform-origin: left center;/, "grown from its left end");
  assert.match(css, /@keyframes bits-brush \{\s*from \{\s*scale: 0 1;/, "by scale alone — the compositor's");
  const home = readFileSync(new URL("../app/(site)/page.tsx", import.meta.url), "utf8");
  assert.match(home, /absolute -bottom-\[0\.09em\] left-0 right-\[8%\]">\s*<HandDrawnReveal variant="brush" tone="hl"/, "where the bar was");
  assert.ok(!/personal-name/.test(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8")), "and the old bar is gone");
});

test("timings are milliseconds, and never negative", () => {
  const out = html(h(HandDrawnReveal, { delay: -50, duration: 1100 }));
  assert.match(out, /--bits-draw-delay:0ms/);
  assert.match(out, /--bits-draw-duration:1100ms/);
});

/* ── EditorialReveal ──────────────────────────────────────── */

test("a reveal is sent with its content in place, and plays from CSS alone", () => {
  const out = html(h(EditorialReveal, { stagger: 60, children: h(React.Fragment, null, h("p", null, "One"), h("p", null, "Two")) }));
  assert.equal(
    out,
    '<div class="bits-reveal" style="--bits-reveal-delay:0ms;--bits-reveal-stagger:60ms" data-trigger="load" data-stagger=""><p>One</p><p>Two</p></div>'
  );
});

test("a reveal that waits for the screen is still sent finished", () => {
  const out = html(h(EditorialReveal, { trigger: "view", as: "header", children: h("h2", null, "Notes along the way") }));
  assert.match(out, /^<header class="bits-reveal"[^>]*data-trigger="view"/);
  assert.ok(!out.includes("data-bits-view"), "nothing is hidden until JavaScript says so");
  assert.ok(!out.includes("data-stagger"), "one block, no stagger unless asked");
  assert.match(out, /<h2>Notes along the way<\/h2>/);
});

test("a stagger is a step of 40-80ms, or none", () => {
  assert.equal(revealStagger(undefined), 0);
  assert.equal(revealStagger(0), 0);
  assert.equal(revealStagger(-20), 0);
  assert.equal(revealStagger(Number.NaN), 0);
  assert.equal(revealStagger(10), 40);
  assert.equal(revealStagger(60), 60);
  assert.equal(revealStagger(200), 80);
  const late = html(h(EditorialReveal, { delay: 5000, children: "x" }));
  assert.match(late, /--bits-reveal-delay:600ms/, "no reveal waits more than 600ms to start");
  assert.match(html(h(EditorialReveal, { delay: -5, children: "x" })), /--bits-reveal-delay:0ms/);
});

test("a sequence never spreads over more than five steps", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  assert.match(css, /\.bits-reveal\[data-stagger\] > :nth-child\(n \+ 6\) \{\s*--bits-reveal-i: 5;/);
  assert.equal(5 * revealStagger(1000), 400, "400ms at the most");
});

test("no page title is ever inside a reveal", () => {
  // The title is the first paint, and usually the page's largest text: an
  // entrance on it would be an entrance on the page's LCP.
  for (const path of ["app/(site)/page.tsx", "app/(site)/works/[slug]/page.tsx", "app/(site)/journal/[slug]/page.tsx"]) {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    let depth = 0;
    for (const [tag] of src.matchAll(/<\/?EditorialReveal\b[^>]*?\/?>|<h1\b/g)) {
      if (tag.startsWith("<h1")) assert.equal(depth, 0, `${path}: the <h1> sits outside every reveal`);
      else if (tag.startsWith("</")) depth--;
      else if (!tag.endsWith("/>")) depth++;
    }
    assert.match(src, /<EditorialReveal/, `${path} does use one`);
  }
});

/* ── PaperCard ────────────────────────────────────────────── */

test("a card that goes somewhere is a real link", () => {
  const out = html(h(PaperCard, { href: "/works/paper-trail-identity", seed: "p1", children: "Paper Trail" }));
  assert.match(out, /^<a [^>]*href="\/works\/paper-trail-identity"/);
  assert.match(out, /class="bits-paper"/);
  assert.match(out, /data-lift="md"/);
  assert.match(out, /style="--bits-paper-tilt:-?0?\.\d+deg"/);
  assert.match(out, />Paper Trail<\/a>$/);
});

test("a card that goes nowhere is the element it is asked to be", () => {
  const out = html(h(PaperCard, { as: "li", lift: "sm", children: "x" }));
  assert.match(out, /^<li class="bits-paper" data-lift="sm"/);
});

test("the lean is a function of the seed, never a dice roll", () => {
  const seeds = Array.from({ length: 24 }, (_, i) => `aaaaaaaa-bbbb-4ccc-8ddd-${String(i).padStart(12, "0")}`);
  for (const seed of seeds) {
    assert.equal(paperTilt(seed), paperTilt(seed), "same seed, same lean");
    assert.ok(Math.abs(paperTilt(seed)) <= 0.6, "a grid card leans 0.6° at most");
    assert.ok(Math.abs(paperTilt(seed, "sm")) <= 0.25, "a wide row leans 0.25° at most");
    assert.ok(paperTilt(seed) !== 0, "and it does lean");
  }
  assert.ok(new Set(seeds.map((s) => paperTilt(s))).size >= 4, "a row of cards does not all lean the same way");
  assert.ok(new Set(seeds.map((s) => Math.sign(paperTilt(s)))).size === 2, "they lean both ways");
  assert.equal(paperTilt(Number.NaN), paperTilt(0), "a nonsense seed is still a lean");
});

test("the cards are paper now, and nothing else moves on them", () => {
  const project = readFileSync(new URL("../components/project-card.tsx", import.meta.url), "utf8");
  const journal = readFileSync(new URL("../components/journal-card.tsx", import.meta.url), "utf8");
  for (const [name, src] of [["project", project], ["journal", journal]] as const) {
    assert.match(src, /<PaperCard\b[^>]*seed=\{(project|post)\.id\}/, `${name}: leans by its own id`);
    assert.ok(!/transition-all|hover:-translate-y|hover:shadow-lift|shadow-card/.test(src), `${name}: the lift is PaperCard's alone`);
  }
  assert.ok(!/group-hover:scale/.test(project), "the photo no longer zooms: one card, one idea");
  assert.ok(!/overflow-hidden rounded-md border/.test(project), "the card does not clip its own lifted shadow");
  assert.match(journal, /lift="sm"/, "a wide row lifts less");
});

/* ── Tally ────────────────────────────────────────────────── */

test("only digits roll, each against the digit in its own place", () => {
  assert.deepEqual(tallyRuns("2 readers", "3 readers"), [
    { kind: "digit", from: 2, to: 3 },
    { kind: "text", text: " readers" },
  ]);
  assert.deepEqual(tallyRuns("1 reader", "2 readers"), [
    { kind: "digit", from: 1, to: 2 },
    { kind: "text", text: " readers" },
  ], "the word simply changes");
  assert.deepEqual(tallyRuns("1.2K readers", "1.3K readers"), [
    { kind: "digit", from: 1, to: 1 },
    { kind: "text", text: "." },
    { kind: "digit", from: 2, to: 3 },
    { kind: "text", text: "K readers" },
  ]);
  assert.deepEqual(tallyRuns("19", "20"), [
    { kind: "digit", from: 1, to: 2 },
    { kind: "digit", from: 9, to: 0 },
  ], "9 to 0 is a column like any other; the strip rolls it forward");
});

test("a number that gains or loses a digit is swapped, not rolled", () => {
  assert.equal(tallyRuns("9 readers", "10 readers"), null);
  assert.equal(tallyRuns("999 readers", "1K readers"), null);
  assert.equal(tallyRuns("12", "12 readers"), null);
});

test("at rest, and from the server, a tally is plain text", () => {
  const out = html(h(Tally, { value: 128, format: formatReaders }));
  assert.equal(out, '<span class="bits-tally">128 readers</span>');
  assert.equal(html(h(Tally, { value: 48200 })), '<span class="bits-tally">48,200</span>');
  assert.equal(html(h(Tally, { value: 0, format: formatReaders })), "", "nothing to print, nothing printed");
});

test("the reader count rolls, politely", () => {
  const tally = readFileSync(new URL("../components/bits/tally.tsx", import.meta.url), "utf8");
  assert.match(tally, /prefers-reduced-motion: reduce/, "reduced motion swaps the number");
  assert.match(tally, /useReducedMotion\(\)/);
  assert.match(tally, /\.animate\(/, "the Web Animations API, not a frame loop");
  assert.match(tally, /value > shown\.value/, "it only rolls upwards");
  assert.match(tally, /className="sr-only"/, "the real text is there while the digits roll");
  assert.match(tally, /aria-hidden className="bits-tally-roll"/);
  assert.ok(!/aria-live/.test(tally), "a count going up is not worth an announcement");
  const count = readFileSync(new URL("../components/reader-count.tsx", import.meta.url), "utf8");
  assert.match(count, /<Tally value=\{count\} format=\{formatReaders\} \/>/);
});

test("a token's duration is read with its unit, whatever the build did to it", () => {
  // Found in the production build: the minifier ships --motion-reveal as
  // ".52s", and parseFloat made the roll half a millisecond long.
  assert.equal(cssDuration("520ms", 0), 520);
  assert.equal(cssDuration(" .52s", 0), 520);
  assert.equal(cssDuration("0.52s", 0), 520);
  assert.equal(cssDuration("", 400), 400);
  assert.equal(cssDuration("fast", 400), 400);
  assert.equal(cssDuration("520", 400), 400, "a bare number is not a duration");
  assert.equal(cssDuration("-5ms", 400), 400);
  const tally = readFileSync(new URL("../components/bits/tally.tsx", import.meta.url), "utf8");
  assert.match(tally, /cssDuration\(root\.getPropertyValue\("--motion-reveal"\), 520\)/);
  assert.ok(!/parseFloat\(root\.getPropertyValue/.test(tally));
});

/* ── WorkTransition ───────────────────────────────────────── */

test("a travelling photograph adds nothing to the page it sits on", () => {
  // <ViewTransition> renders no element of its own: the photograph is the
  // same markup it always was, and only gains a name while a navigation runs.
  const out = html(h(WorkTransition, { name: workPhotoName("p1"), children: h("span", { className: "photo" }, "Paper Trail") }));
  assert.equal(out, '<span class="photo">Paper Trail</span>');
  assert.equal(workPhotoName("8bac8a99-e0de-4b7a-a6bb-bac67d993415"), "work-8bac8a99-e0de-4b7a-a6bb-bac67d993415");
});

test("the card's photograph and the work's cover go by the same name", () => {
  const card = readFileSync(new URL("../components/project-card.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/(site)/works/[slug]/page.tsx", import.meta.url), "utf8");
  // The image itself travels, not its frame: the "pinned" stamp stays on the card.
  assert.match(card, /<WorkTransition name=\{workPhotoName\(project\.id\)\}>\s*<Pic\s+src=\{project\.thumbnail_public_id\}/);
  assert.match(page, /<WorkTransition name=\{workPhotoName\(project\.id\)\}>\s*<Pic src=\{project\.cover_public_id\}/);
  const bits = readFileSync(new URL("../components/bits/work-transition.tsx", import.meta.url), "utf8");
  assert.match(bits, /share="bits-morph" default="none"/, "only the pair moves, and only when it is a pair");
});

test("only the photograph moves: the page swaps, and the header it lands under stays put", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/(site)/works/[slug]/page.tsx", import.meta.url), "utf8");
  assert.match(css, /:root \{\s*view-transition-name: none;/, "no cross-fade of the whole page");
  assert.deepEqual(workHeaderStyle, { viewTransitionName: "bits-work-header" });
  assert.match(page, /<header\s[^>]*style=\{workHeaderStyle\}/, "the entry header over the cover is named");
  assert.match(css, /::view-transition-group\(bits-work-header\) \{\s*z-index: 1;\s*animation: none;/, "above the landing photograph, and still");
  assert.match(css, /::view-transition-old\(bits-work-header\) \{\s*display: none;/, "never two headers at once");
  assert.match(css, /::view-transition-new\(bits-work-header\) \{\s*animation: none;/);
});

test("a page opened from far down the last one starts at its top, instead of gliding up to it", () => {
  // globals.css scrolls smoothly, and since Next.js 16 the router only sets
  // that aside for a navigation when <html> asks it to. Without it the new
  // page glided up from the old one's scroll position for over half a second
  // (measured, on master too), and the photograph landed on a cover that was
  // still on its way up.
  const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  assert.match(globals, /html \{\s*scroll-behavior: smooth;/);
  assert.match(layout, /<html [^>]*data-scroll-behavior="smooth"/);
});

test("the morph keeps both pictures' proportions and stands still for reduced motion", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  assert.match(css, /::view-transition-group\(\.bits-morph\) \{\s*animation-duration: var\(--motion-reveal\);/);
  assert.match(css, /::view-transition-new\(\.bits-morph\) \{\s*height: 100%;\s*object-fit: cover;/, "a 4:3 card and a wide cover are cropped, never stretched");
  assert.match(css, /::view-transition-old\(\.bits-morph\) \{\s*animation: none;/, "a cover still loading never leaves an empty frame mid-flight");
  assert.match(
    css,
    /::view-transition-new\(\.bits-morph\) \{\s*animation: bits-morph-arrive var\(--motion-reveal\) var\(--motion-ease-out\);/,
    "the cover arrives with a plain fade: the browser's plus-lighter one washes out over a solid photograph"
  );
  assert.match(css, /@keyframes bits-morph-arrive \{\s*from \{\s*opacity: 0;\s*\}\s*\}/);
  assert.match(css, /::view-transition \{\s*pointer-events: none;/, "clicks go through while it runs");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*::view-transition-group\(\*\),\s*::view-transition-old\(\*\),\s*::view-transition-new\(\*\) \{\s*animation: none;/);
});

/* ── the pile (the gallery Stack) ─────────────────────────── */

test("a pile is sent on the desk: tilted, and visible, before any script runs", () => {
  const items = ["a", "b", "c"].map((seed) => ({ src: `https://picsum.photos/seed/${seed}/1100/825`, alt: `Print ${seed}` }));
  const blocks = [{ id: "g", type: "gallery", position: 0, data: { layout: "stack", items } }] as unknown as Block[];
  const out = html(h(BlockRenderer, { blocks }));
  const cards = out.match(/<figure class="bits-pile-card" style="[^"]*"/g) ?? [];
  assert.equal(cards.length, 3, "one print per photograph");
  assert.match(cards[0], /--bits-pile-tilt:-2.4deg;--bits-pile-delay:0ms/);
  assert.match(cards[1], /--bits-pile-tilt:1.8deg;--bits-pile-delay:60ms/);
  assert.ok(!out.includes("data-bits-view"), "the waiting state is only ever the browser's to set");
  assert.ok(!/opacity:\s*0/.test(out), "nothing is hidden in the HTML");
  assert.ok(!/transform:/.test(out), "the tilt is `rotate`, which the entrance's `translate` cannot undo");
});

test("a pile lands in 400 ms at most, however many prints are in it", () => {
  assert.equal(settleDelay(0, 1), 0);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => settleDelay(i, 5)), [0, 60, 120, 180, 240], "60 ms apart");
  assert.equal(settleDelay(9, 10), 400, "closer together for a big pile");
  assert.ok(settleDelay(1, 10) >= 40, "but never closer than 40 ms");
  assert.equal(settleDelay(19, 20), 400, "and the last one never starts later than 400 ms");
});

test("the pile settles through the shared trigger, only when motion is welcome", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  assert.match(css, /\.bits-pile-card \{\s*rotate: var\(--bits-pile-tilt, 0deg\);/, "the tilt is the print's shape, always there");
  assert.match(
    css,
    /@media screen and \(prefers-reduced-motion: no-preference\) \{\s*\[data-bits-view="waiting"\] \.bits-pile-card \{\s*opacity: 0;/
  );
  assert.match(
    css,
    /\[data-bits-view="playing"\] \.bits-pile-card \{\s*animation: bits-settle var\(--motion-reveal\) var\(--motion-ease-out\) var\(--bits-pile-delay, 0ms\) backwards;/
  );
  assert.match(css, /@keyframes bits-settle \{\s*from \{\s*opacity: 0;\s*translate: 0 calc\(var\(--motion-rise\) \* 1\.5\);/, "12 px on a desktop, 9 on a phone: paper doesn't fly");
});

/* ── PhotoStack ───────────────────────────────────────────── */

const moments = [
  { src: "https://picsum.photos/seed/m1/1000/800", alt: "Stalls lit up at night", title: "Night market", caption: "Where the weekend starts." },
  { title: "A note to myself", caption: "Make the thing, then make it better." },
  { src: "https://picsum.photos/seed/m3/1000/800", alt: "Riso posters drying", title: "Riso day" },
];

test("every print is in the page, in order, with its own words, whichever is on top", () => {
  const out = html(h(PhotoStack, { items: moments }));
  const prints = out.match(/<li class="bits-pile-card bits-photo-print"[^>]*>/g) ?? [];
  assert.equal(prints.length, 3);
  assert.match(prints[0], /data-bits-title="Night market" data-bits-photo=""/);
  assert.match(prints[0], /z-index:3;--bits-pile-tilt:-2.4deg;--bits-pile-delay:\d+ms;--bits-print-place:0/, "the first is on top");
  assert.ok(!prints[1].includes("data-bits-photo"), "the note has no photograph");
  assert.match(prints[2], /z-index:1;.*--bits-print-place:2/, "the last is at the bottom");
  // Their words are there for a screen reader (sr-only), in the order they came.
  const captions = [...out.matchAll(/<figcaption class="sr-only[^"]*">([\s\S]*?)<\/figcaption>/g)].map((m) => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  assert.deepEqual(captions, ["Night market Where the weekend starts.", "A note to myself Make the thing, then make it better.", "Riso day"]);
  assert.match(out, /alt="Stalls lit up at night"/);
  assert.ok(!out.includes("data-bits-view"), "sent on the desk");
  assert.ok(!/opacity:\s*0/.test(out), "nothing hidden in the HTML");
});

test("the top print's words sit beside the pile for the eye, with Next and Look closer", () => {
  const out = html(h(PhotoStack, { items: moments }));
  assert.match(out, /<div aria-hidden="true" class="bits-photo-words"><p [^>]*><span data-bits-pile="count">1<\/span> \/ 3<\/p>/);
  const words = out.match(/<div data-bits-words=""[^>]*>/g) ?? [];
  assert.deepEqual(words, ['<div data-bits-words="">', '<div data-bits-words="" hidden="">', '<div data-bits-words="" hidden="">'], "one set of words per print, the top one showing");
  assert.match(out, /<button [^>]*data-bits-pile="next"[^>]*>Next <span aria-hidden="true">↻<\/span><span class="sr-only">: put the top print back underneath<\/span><\/button>/);
  assert.match(out, /<span data-bits-pile="look"><button [^>]*>Look closer <span aria-hidden="true">⤢<\/span><span class="sr-only" data-bits-pile="look-label">: Night market<\/span>/);
  assert.match(out, /<p class="sr-only" aria-live="polite" data-bits-pile="announce"><\/p>/, "and a polite announcement of what came up");
  // Without JavaScript the pile is dealt out as a column, words and all.
  assert.match(out, /<noscript><style>\.bits-photo-pile\{gap:1\.5rem\}/);
  assert.match(out, /\.bits-photo-words,\.bits-photo-controls\{display:none\}/);
});

test("a moment without a photograph is a note, with nothing to look closer at", () => {
  const out = html(h(PhotoStack, { items: [moments[1], moments[0]] }));
  assert.match(out, /font-hand[^"]*">A note to myself<\/div>/, "handwritten on the paper");
  assert.match(out, /<span data-bits-pile="look" hidden="">/, "Look closer waits for a photograph on top");
  assert.ok(!html(h(PhotoStack, { items: [moments[1]] })).includes("Look closer"), "and a pile of notes never offers it");
});

test("one print is a print, not a pile", () => {
  const out = html(h(PhotoStack, { items: [moments[0]] }));
  assert.ok(!out.includes(">Next "), "nothing to put back underneath");
  assert.ok(!out.includes('data-bits-pile="count"'), "and no count of one");
  assert.match(out, /<span data-bits-pile="look">/);
  assert.equal(html(h(PhotoStack, { items: [] })), "");
});

test("About's moments are a PhotoStack, in the HTML itself", () => {
  assert.deepEqual(
    momentItems([
      { title: "Night market", image: "https://picsum.photos/seed/m1/1000/800", alt: "Stalls", caption: "x" },
      { title: "", caption: "" },
      { caption: "Only words" },
    ]),
    [
      { src: "https://picsum.photos/seed/m1/1000/800", alt: "Stalls", title: "Night market", caption: "x" },
      { src: undefined, alt: undefined, title: undefined, caption: "Only words" },
    ],
    "an empty moment is left out; a moment of words alone is a note"
  );
  const out = html(h(PersonalMoments, { moments: [{ title: "Night market", image: "https://picsum.photos/seed/m1/1000/800" }] }));
  assert.match(out, /^<section class="pb-10" aria-label="Personal moments"><div>/);
  // Measured: behind a <Suspense> boundary React 19 sent the pile as a
  // hidden segment for a script to reveal, and with JavaScript off it was not
  // there at all. No boundary, no hidden segment.
  assert.ok(!out.includes("<!--$"), "no Suspense boundary around the pile");
  assert.equal(html(h(PersonalMoments, { moments: [] })), "");
});

test("the pile is drawn by the server; its hands and the lightbox arrive after the page", () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  assert.ok(!/^["']use client["']/m.test(read("components/bits/photo-stack.tsx")), "the pile is a server component");
  assert.ok(!/^["']use client["']/m.test(read("components/personal-moments.tsx")));
  const hands = read("components/bits/photo-stack-hands.tsx");
  assert.match(hands, /import\("\.\/photo-stack-controller"\)/, "what moves the pile is its own chunk");
  assert.match(hands, /lazy\(\(\) => import\("\.\.\/blocks\/lightbox"\)/, "and so is the lightbox, fetched when somebody reaches for it");
  assert.ok(!/^import \{[^}]*\bLightbox\b[^}]*\} from/m.test(hands), "never imported up front");
  const controller = read("components/bits/photo-stack-controller.ts");
  assert.match(controller, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/, "the lift never runs for reduced motion");
  assert.match(controller, /cssDuration\(tokens\.getPropertyValue\("--motion-reveal"\), 520\)/, "and reads the token with its unit");
});

test("the pile is one grid cell and moves up a notch only when motion is welcome", () => {
  const css = readFileSync(new URL("../components/bits/bits.css", import.meta.url), "utf8");
  assert.match(css, /\.bits-photo-print \{\s*grid-area: 1 \/ 1;/, "as tall as its tallest print, whichever is on top");
  assert.match(css, /\.bits-photo-paper \{\s*translate: calc\(min\(var\(--bits-print-place, 0\), 3\) \* 6px\) calc\(min\(var\(--bits-print-place, 0\), 3\) \* 4px\);/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.bits-photo-paper \{\s*transition: translate var\(--motion-base\) var\(--motion-ease-out\);/);
  assert.match(css, /\[data-bits-pile-ready\] \.bits-photo-pile \{\s*cursor: pointer;/, "a hand only once the hands are there");
});
