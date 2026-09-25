import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * What keeps the public notebook fast, pinned so it does not drift back.
 *
 * Each of these was measured before it was changed: every public page
 * downloaded Framer Motion for a two-pixel progress bar, /works and every
 * project and journal entry were rendered on demand for each visit, and a
 * project page asked the database the same questions six times. Two of the
 * guards below pin the opposite — changes that were tried, measured worse in
 * Lighthouse, and taken back. None of it is visible in a review of the
 * component that causes it, which is why it is asserted here.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Comments are prose about the code, not the code. */
const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/* ── what every public page downloads ─────────────────────── */

test("the site shell ships no animation library", () => {
  // Everything the (site) layout renders on every route, plus the pieces
  // most pages use. Framer Motion stays where it animates layout — the Works
  // and Journal explorers, and the Studio's drag-to-reorder.
  for (const path of [
    "app/(site)/layout.tsx",
    "components/site-nav.tsx",
    "components/site-footer.tsx",
    "components/scroll-progress.tsx",
    "components/theme-toggle.tsx",
    "components/bits/in-view.tsx",
    "components/bits/hand-drawn-reveal.tsx",
    "components/motion.tsx",
    "components/blocks/lightbox.tsx",
    "components/blocks/gallery/grid.tsx",
    "components/blocks/gallery/carousel.tsx",
    "components/blocks/gallery/accordion.tsx",
    "components/blocks/gallery/stack.tsx",
  ]) {
    assert.ok(!code(path).includes("framer-motion"), `${path} does not import framer-motion`);
  }
});

test("the explorers load the animation engine after the list, not before it", () => {
  for (const path of ["components/works-explorer.tsx", "components/journal-explorer.tsx"]) {
    const src = code(path);
    assert.match(src, /<LazyMotion features=\{loadMotionFeatures\} strict>/, `${path} defers the engine`);
    assert.match(src, /import\("\.\/motion-features"\)/, `${path} loads it as its own chunk`);
    assert.ok(!/<motion\./.test(src), `${path} uses the light m components throughout`);
  }
});

test("a list is visible in the HTML, not waiting for JavaScript to fade it in", () => {
  // AnimatePresence animates its first children from `initial` unless told
  // otherwise, and on the server that meant every card at opacity 0.
  for (const path of ["components/works-explorer.tsx", "components/journal-explorer.tsx"]) {
    const src = code(path);
    assert.match(src, /<AnimatePresence mode="popLayout" initial=\{settled\}>/, path);
    assert.match(src, /useState\(false\)/, `${path} starts unsettled on the server`);
  }
});

test("every face on the first screen stays preloaded", () => {
  // Measured both ways: without a preload, Caveat and JetBrains Mono were
  // discovered at first layout and the first paint waited for them (mobile
  // FCP 0.9s → 1.8s). All four appear above the fold on every page.
  const layout = code("app/layout.tsx");
  assert.ok(!layout.includes("preload: false"), "no font opts out of preloading");
});

/* ── what is rendered ahead of time ───────────────────────── */

test("/works is a static page: the filter is read in the browser", () => {
  const page = code("app/(site)/works/page.tsx");
  assert.ok(!page.includes("searchParams"), "reading searchParams would make every visit a server render");
  const explorer = code("components/works-explorer.tsx");
  assert.match(explorer, /new URLSearchParams\(window\.location\.search\)/, "the explorer reads the address itself");
  assert.match(explorer, /addEventListener\("popstate", restore\)/, "and follows back and forward");
});

test("project and journal pages are prerendered and kept with ISR", () => {
  for (const path of ["app/(site)/works/[slug]/page.tsx", "app/(site)/journal/[slug]/page.tsx"]) {
    const src = code(path);
    assert.match(src, /export async function generateStaticParams\(\)/, `${path} lists its pages`);
    assert.match(src, /return res\.ok \? res\.value\.map/, `${path} lists nothing, rather than failing the build, when the read fails`);
    assert.match(src, /export const revalidate = 60;/, `${path} still refreshes`);
  }
});

test("no loading skeleton sits in front of a prerendered public page", () => {
  // Tried and measured: a loading.tsx on the detail routes puts its skeleton
  // into the *static* HTML, with the real article hidden behind it until
  // React's inline swap runs — and React throttles that reveal to 300ms after
  // the skeleton paints. Every first visit to a prerendered, fully-known page
  // then showed a skeleton for a third of a second. Prefetched navigation is
  // already instant, which is the only case a skeleton was for.
  for (const route of ["app/(site)", "app/(site)/works", "app/(site)/works/[slug]", "app/(site)/journal", "app/(site)/journal/[slug]"]) {
    assert.throws(() => source(`${route}/loading.tsx`), /ENOENT/, `${route} has no loading.tsx`);
  }
});

/* ── what one render asks the database ────────────────────── */

test("every public reader is memoised for the render", () => {
  const data = code("lib/data.ts");
  for (const reader of [
    "getSettings",
    "getProjects",
    "getProjectBySlug",
    "getJournalPosts",
    "getJournalBySlug",
    "getPage",
    "getTags",
    "getPublicProjects",
    "getPublicJournal",
  ]) {
    assert.match(data, new RegExp(`const ${reader} = cache\\(`), `${reader} is wrapped in cache()`);
  }
});

test("a detail page reads the list once instead of its own row twice", () => {
  const data = code("lib/data.ts");
  const bySlug = data.slice(data.indexOf("export const getProjectBySlug"), data.indexOf("const getPublicJournal"));
  assert.ok(bySlug.length > 0 && bySlug.length < 400, "the slice is the one function");
  assert.match(bySlug, /await getPublicProjects\(\)/);
  assert.ok(!bySlug.includes(".from("), "no separate query for the one project");
});

test("the page reader no longer fetches blocks nothing renders", () => {
  const data = code("lib/data.ts");
  const getPage = data.slice(data.indexOf("export const getPage"), data.indexOf("export const getTags"));
  assert.ok(getPage.length > 0 && getPage.length < 1200, "the slice is the one function");
  assert.ok(!getPage.includes("content_blocks"), "Home, About and Connect render from `data` alone");
});
