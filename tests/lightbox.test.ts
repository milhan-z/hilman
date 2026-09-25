import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/**
 * Clicking a photograph opens it.
 *
 * Every presentation in this system shows media at the size the *layout*
 * wanted — a grid tile cropped to 4:3, a fanned card, a sliver of an
 * accordion. That is right for reading a page and wrong for the moment
 * somebody wants to see the picture, so each of them now offers a way out to
 * the whole thing.
 *
 * What is asserted here is mostly structure, because the behaviour needs a
 * real browser. It was verified in one, at 1280px and 390px: every surface
 * opens, the counter tracks, arrows move and wrap, Escape closes, the body
 * stops scrolling while it is open and starts again after, focus enters the
 * dialog and returns to the photograph that was clicked, the backdrop closes
 * and the image does not, and the arrows sit fully on screen at 390px.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments are prose about the code, not the code. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const LIGHTBOX = "components/blocks/lightbox.tsx";

const SURFACES = [
  "components/blocks/gallery/grid.tsx",
  "components/blocks/gallery/carousel.tsx",
  "components/blocks/gallery/stack.tsx",
  "components/blocks/gallery/accordion.tsx",
];

/* ── every presentation offers the way out ────────────────── */

test("all four gallery presentations can open a photograph", () => {
  for (const path of SURFACES) {
    const src = code(path);
    assert.match(src, /useLightbox\(\)/, `${path} holds open state`);
    assert.match(src, /<Lightbox/, `${path} renders the overlay`);
  }
});

test("a single image block can open too, without leaving the server", () => {
  // image-layouts.tsx stays a server component — five presentations of markup
  // have no business being shipped to the browser. Only the clicking crosses
  // the boundary.
  const layouts = code("components/blocks/image-layouts.tsx");
  assert.ok(!layouts.includes('"use client"'), "the presentations stay server-rendered");
  assert.match(layouts, /<ZoomableImage/, "and are wrapped by a client island");

  const island = code("components/blocks/zoomable-image.tsx");
  assert.match(island, /"use client"/);
  assert.match(island, /<Lightbox/);
});

test("every image presentation is openable, not just the default one", () => {
  const layouts = code("components/blocks/image-layouts.tsx");
  const wrapped = (layouts.match(/<ZoomableImage/g) ?? []).length;
  // default, full, browser, phone, polaroid.
  assert.equal(wrapped, 5, "all five presentations wrap their image");
});

/* ── it is a dialog, and behaves like one ─────────────────── */

test("the overlay is announced as a modal dialog", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /role="dialog"/);
  assert.match(lb, /aria-modal="true"/);
  assert.match(lb, /aria-label=/);
});

test("the trigger is a real button, so the keyboard gets it for free", () => {
  const lb = code(LIGHTBOX);
  const trigger = lb.slice(lb.indexOf("export function ZoomTrigger"));
  assert.match(trigger.slice(0, 900), /<button/, "not a div with an onClick");
  assert.match(trigger.slice(0, 900), /type="button"/);
  assert.match(trigger.slice(0, 900), /sr-only/, "and it says what it does");
});

test("Escape closes and the arrows navigate", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /event\.key === "Escape"/);
  assert.match(lb, /event\.key === "ArrowRight"/);
  assert.match(lb, /event\.key === "ArrowLeft"/);
});

test("Tab cannot wander into the page underneath", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /event\.key !== "Tab"/, "Tab is handled");
  assert.match(lb, /shiftKey/, "in both directions");
});

test("the page behind does not scroll while it is open", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /document\.body\.style\.overflow = "hidden"/);
  assert.match(lb, /document\.body\.style\.overflow = overflow/, "and gets it back afterwards");
});

/**
 * The regression this file exists for.
 *
 * The focus and scroll effect originally shared a hook with the key handler,
 * which closes over `go`, which closes over `index`. So it tore down and
 * re-ran on every arrow press, re-capturing "what to give focus back to" while
 * focus was already inside the dialog. By the time it closed, that captured
 * element was the dialog's own close button — gone from the document — and
 * focus fell to <body>, losing the reader's place on the page.
 */
test("focus is captured once on opening, not on every navigation", () => {
  const lb = code(LIGHTBOX);
  const deps = lb.match(/\}, \[[^\]]*\]\);/g) ?? [];
  // `mounted` turns true once and stays true, so it cannot re-run the effect
  // during an opening; it only lets a lightbox that arrives already open
  // (loaded on demand) wait for its portal before focusing into it.
  assert.ok(
    deps.some((d) => d.includes("[isOpen, mounted]")),
    "one effect depends on isOpen (and mounted) alone — the one that owns focus and scroll"
  );
  assert.match(lb, /if \(!isOpen \|\| !mounted\) return;/);
  assert.ok(
    deps.some((d) => d.includes("isOpen") && d.includes("go")),
    "and a separate one owns the key handler, free to re-subscribe"
  );

  // The capture must be a local const inside the open effect, not a ref that
  // outlives it — a ref is what let the stale value survive a re-run.
  assert.match(lb, /const previouslyFocused = document\.activeElement;/);
  assert.match(lb, /previouslyFocused instanceof HTMLElement/);
});

/* ── where it renders, and why that matters ───────────────── */

test("the overlay escapes its ancestors through a portal", () => {
  // Any ancestor with transform, filter or backdrop-filter becomes the
  // containing block for position:fixed. The Stack's cards are rotated, so
  // rendering in place would pin a full-screen overlay to a tilted card. This
  // repository has been caught by that exact trap once already, in the
  // Studio's sync sheet.
  const lb = code(LIGHTBOX);
  assert.match(lb, /createPortal\(/);
  assert.match(lb, /document\.body\s*\)/, "onto the body, not a nearer parent");
});

test("nothing is rendered at all while it is closed", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /if \(!mounted \|\| index === null\) return null;/);
});

/* ── the photograph itself ────────────────────────────────── */

test("the opened photograph is never cropped", () => {
  // The whole point of opening it was to see all of it. A grid tile crops to
  // 4:3 on purpose; the overlay is where that gets undone.
  const lb = code(LIGHTBOX);
  assert.match(lb, /object-contain/);
  assert.ok(!lb.includes("object-cover"), "no cropping anywhere in the overlay");
});

test("the overlay asks for a larger source than any thumbnail would", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /mediaSrc\(item\.src, \{ width: 2000 \}\)/);
});

test("a single image shows no counter and no arrows", () => {
  const lb = code(LIGHTBOX);
  assert.match(lb, /const many = items\.length > 1;/);
  assert.match(lb, /\{many && <Arrow/, "arrows are conditional");
  assert.match(lb, /many \? `\$\{index \+ 1\} \/ \$\{items\.length\}` : ""/, "so is the counter");
});

test("the arrows float over the image rather than competing for its width", () => {
  // In the flow they lost to `max-w-full` and hung half off a 390px screen —
  // measured at 390px before the fix, and after it the two arrows sit at
  // 12–56 and 334–378 with neither clipped.
  const lb = code(LIGHTBOX);
  assert.match(lb, /absolute top-1\/2/, "they are taken out of the flow");
  assert.match(lb, /-translate-y-1\/2/, "and centred against the photograph");
  assert.match(lb, /side === "left" \? "left-0 sm:left-2" : "right-0 sm:right-2"/);

  // The box holding them has to establish the positioning context, or
  // `absolute` would resolve against the dialog and drift as the header and
  // caption change height.
  assert.match(lb, /className="relative flex min-h-0 flex-1/);
});

/* ── motion, and what it costs ────────────────────────────── */

test("the overlay respects a preference for less motion", () => {
  // The two fades are CSS classes, and the stylesheet switches both off for
  // anyone who has asked for less motion.
  const lb = code(LIGHTBOX);
  assert.match(lb, /className="lightbox-in /, "the backdrop fades through a class");
  assert.match(lb, /className="lightbox-photo-in /, "and so does each photograph");

  const css = source("app/globals.css");
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\}/g) ?? [];
  const opted = reduced.join("\n");
  assert.match(opted, /\.lightbox-in/, "no entrance when it is not wanted");
  assert.match(opted, /\.lightbox-photo-in/);
});

test("opening a photograph does not cost an animation library", () => {
  // Every image block on an article is openable, so whatever this file
  // imports is downloaded by every article with a photograph in it.
  assert.ok(!code(LIGHTBOX).includes("framer-motion"));
});

test("no lightbox library was added to do any of this", () => {
  const pkg = JSON.parse(source("package.json"));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of [
    "photoswipe",
    "yet-another-react-lightbox",
    "react-image-lightbox",
    "lightgallery",
    "fslightbox-react",
    "react-modal",
  ]) {
    assert.equal(banned in deps, false, `${banned} is not a dependency`);
  }
});

/* ── the accordion's double duty ──────────────────────────── */

test("an accordion panel opens the panel, then opens the photograph", () => {
  // Tapping the already-open panel used to do nothing at all — a dead target
  // sitting exactly where the most obvious one should be.
  const acc = code("components/blocks/gallery/accordion.tsx");
  assert.match(acc, /isActive \? lightbox\.open\(i\) : setActive\(i\)/);
  assert.match(acc, /isActive && "cursor-zoom-in"/, "and the cursor says so");
});

test("hover still only previews, even now that clicking does more", () => {
  // A fan cannot be hovered on a phone, so hover must never be the only way
  // to reach anything.
  const acc = code("components/blocks/gallery/accordion.tsx");
  assert.match(acc, /onMouseEnter=\{\(\) => setActive\(i\)\}/, "hover selects, never zooms");
});
