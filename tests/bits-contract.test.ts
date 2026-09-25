import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * The HILMAN BITS rulebook, as far as a machine can hold it.
 *
 * docs/HILMAN-BITS.md says what the primitives in components/bits/ are for
 * and when a page has had enough of them — judgement, which no test can do.
 * What a test can do is refuse the handful of things that are never right:
 * movement that ignores reduced motion, a page hidden until an animation
 * decides to show it, randomness that rearranges itself on every render, a
 * component quietly taking over the page, a second set of timing numbers
 * drifting away from the first. Every one of those is invisible in a review
 * of the component that introduces it, which is why it lives here.
 *
 * React Bits keeps its defaults honest the same way (`check:prop-docs`).
 */

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** Comments are prose about the code, not the code. */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function filesIn(dir: string, pattern: RegExp): string[] {
  let entries: string[];
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(join(ROOT, path)).isDirectory()) return filesIn(path, pattern);
    return pattern.test(entry) ? [path] : [];
  });
}

const sources = filesIn("components/bits", /\.tsx?$/);
const sheet = read("components/bits/bits.css");

/* ── the components ───────────────────────────────────────── */

test("the primitives are where the rulebook says they are", () => {
  assert.ok(sources.includes("components/bits/in-view.tsx"), "the shared trigger is there");
  assert.ok(sources.length >= 1);
});

test("every export says what it is for", () => {
  for (const file of sources) {
    const text = read(file);
    for (const match of text.matchAll(/^export (?:async )?function (\w+)/gm)) {
      const before = text.slice(0, match.index).trimEnd();
      assert.ok(before.endsWith("*/"), `${file}: ${match[1]} has a doc comment directly above it`);
    }
  }
});

test("only the pieces that need the browser are client components", () => {
  // Everything else is a server component: it ships no JavaScript, and it is
  // finished in the HTML before any script runs.
  const allowed = new Set(["components/bits/in-view.tsx", "components/bits/tally.tsx"]);
  for (const file of sources) {
    const client = /^["']use client["'];?/m.test(read(file));
    if (client) assert.ok(allowed.has(file), `${file} is a client component and is not on the list`);
  }
});

test("no randomness, no animation library, no hold on the page", () => {
  const banned: [RegExp, string][] = [
    [/Math\.random\(/, "Math.random — randomness goes through a seed, or the server and the browser disagree"],
    [/requestAnimationFrame\(/, "requestAnimationFrame — nothing in the public notebook runs a frame loop"],
    [/from ["'](framer-motion|motion|gsap|three|ogl|lenis|@react-three\/[\w-]+)["']/, "an animation library"],
    [/document\.(body|documentElement)\.style/, "a style on the whole document"],
    [/window\.addEventListener\(\s*["'](wheel|touchmove|touchstart|scroll)["']/, "a listener on the whole window"],
  ];
  for (const file of sources) {
    const text = stripComments(read(file));
    for (const [pattern, what] of banned) {
      assert.ok(!pattern.test(text), `${file} uses ${what}`);
    }
  }
});

test("the Studio stays still", () => {
  // Speed and clarity: the Studio gets quick feedback, never decoration.
  for (const dir of ["app/admin", "components/admin"]) {
    for (const file of filesIn(dir, /\.tsx?$/)) {
      assert.ok(!/components\/bits/.test(read(file)), `${file} imports HILMAN BITS`);
    }
  }
});

test("the public site loads the stylesheet, and the Studio never does", () => {
  assert.match(read("app/(site)/layout.tsx"), /import "@\/components\/bits\/bits\.css";/);
  assert.ok(!read("app/layout.tsx").includes("bits.css"), "not from the root layout, which the Studio shares");
});

/* ── the stylesheet ───────────────────────────────────────── */

type Declaration = { property: string; value: string; context: string[] };

/** Every declaration in the sheet, with the selectors and at-rules around it. */
function declarations(css: string): Declaration[] {
  const out: Declaration[] = [];
  const context: string[] = [];
  let buffer = "";
  const flush = () => {
    const match = buffer.trim().match(/^([\w-]+)\s*:\s*([\s\S]+)$/);
    if (match) out.push({ property: match[1], value: match[2].trim(), context: [...context] });
    buffer = "";
  };
  for (const char of stripComments(css)) {
    if (char === "{") {
      context.push(buffer.trim());
      buffer = "";
    } else if (char === "}") {
      flush();
      context.pop();
    } else if (char === ";") {
      flush();
    } else {
      buffer += char;
    }
  }
  return out;
}

const all = declarations(sheet);
const inKeyframes = (d: Declaration) => d.context.some((c) => c.startsWith("@keyframes"));
const allowsMotion = (d: Declaration) =>
  d.context.some((c) => c.startsWith("@media") && /prefers-reduced-motion:\s*no-preference/.test(c));

test("movement is opt-in: reduced motion gets the finished page by construction", () => {
  const moving = all.filter(
    (d) =>
      !inKeyframes(d) &&
      ["animation", "animation-name", "translate", "rotate", "scale"].includes(d.property) &&
      d.value !== "none"
  );
  for (const d of moving) {
    assert.ok(allowsMotion(d), `${d.context.at(-1)} { ${d.property}: ${d.value} } is outside a no-preference block`);
  }
});

test("a waiting state is only ever drawn on a screen that allows motion", () => {
  // "waiting" is where an entrance starts — out of sight, or undrawn. Printed,
  // or for somebody who asked for less motion, it must never exist.
  for (const d of all.filter((d) => d.context.some((c) => c.includes('data-bits-view="waiting"')))) {
    const media = d.context.filter((c) => c.startsWith("@media")).join(" ");
    assert.match(media, /screen/, `${d.context.at(-1)} is screen-only`);
    assert.ok(allowsMotion(d), `${d.context.at(-1)} is inside a no-preference block`);
  }
});

test("only what is cheap to move is moved", () => {
  const css = stripComments(sheet);
  assert.ok(!/(^|[\s;{])(backdrop-)?filter\s*:/.test(css), "no filters: a blur on text is a repaint every frame");
  assert.ok(!/blur\(/.test(css), "nothing blurs");
  assert.ok(!/(^|[\s;{])transform\s*:/.test(css), "translate / rotate / scale, never transform");
  for (const d of all.filter((d) => d.property.startsWith("transition"))) {
    assert.ok(!/\ball\b/.test(d.value), `${d.context.at(-1)}: transitions name what they move`);
    assert.ok(!/box-shadow/.test(d.value), `${d.context.at(-1)}: a shadow is faded in, never animated`);
  }
  for (const d of all.filter(inKeyframes)) {
    assert.ok(!["box-shadow", "width", "height", "top", "left"].includes(d.property), `@keyframes never animate ${d.property}`);
  }
});

test("every duration is a token or milliseconds, and every name is ours", () => {
  for (const d of all.filter((d) => /^(animation|transition)/.test(d.property))) {
    assert.ok(!/(^|[\s,(])\d*\.?\d+s\b/.test(d.value), `${d.context.at(-1)}: ${d.value} — durations are in ms`);
  }
  const css = stripComments(sheet);
  for (const [, name] of css.matchAll(/@keyframes\s+([\w-]+)/g)) {
    assert.ok(name.startsWith("bits-"), `@keyframes ${name} starts with bits-`);
  }
  const selectors = [...new Set(all.flatMap((d) => d.context))].filter((c) => !c.startsWith("@"));
  for (const selector of selectors) {
    for (const [, name] of selector.matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
      assert.ok(name.startsWith("bits-"), `.${name} in "${selector}" starts with bits-`);
    }
  }
});

/* ── one set of numbers ───────────────────────────────────── */

test("Tailwind's timing tokens and the CSS ones are the same numbers", () => {
  const config = read("tailwind.config.ts");
  const globals = read("app/globals.css");
  const token = (name: string) => globals.match(new RegExp(`--motion-${name}:\\s*([^;]+);`))?.[1].trim();

  assert.equal(config.match(/fast:\s*"([^"]+)"/)?.[1], token("fast"));
  assert.equal(config.match(/base:\s*"([^"]+)"/)?.[1], token("base"));
  assert.equal(config.match(/out:\s*"([^"]+)"/)?.[1], token("ease-out"));
  assert.match(config, /reveal:\s*"var\(--motion-reveal\)"/, "named, not copied");
  assert.match(config, /draw:\s*"var\(--motion-draw\)"/, "named, not copied");
  for (const name of ["reveal", "draw", "stagger", "rise", "ease-draw"]) {
    assert.ok(token(name), `--motion-${name} is declared`);
  }
  for (const name of ["fast", "base", "reveal", "draw", "stagger"]) {
    assert.match(token(name) ?? "", /^\d+ms$/, `--motion-${name} is in milliseconds`);
  }
});
