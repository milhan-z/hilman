import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Opacity modifiers that would silently do nothing.
 *
 * Tailwind v3 can only apply `/50` to a colour declared with the
 * `<alpha-value>` placeholder. Every custom colour in tailwind.config.ts is a
 * bare `var(--x)` string, so `bg-paper/95` does not compile to anything at all
 * — the class is simply absent from the stylesheet.
 *
 * That failure is invisible in review and loud on screen, in two different
 * ways depending on the property:
 *
 *   background   nothing is emitted, so the element is transparent. App chrome
 *                meant to be opaque had content scrolling through it.
 *   border       nothing is emitted, so the border falls back to Tailwind's
 *                default `borderColor`, rgb(229 231 235) — a near-white grey.
 *                `border-red/40` drew a pale grey line on dark chrome.
 *
 * Seventy-five of these had accumulated, including on the public site. They
 * were removed rather than made to work: switching the palette to channel
 * triplets would turn all seventy-five on at once, and there is no way to tell
 * which were intended and which were habit.
 *
 * This test is the thing that stops them coming back. If a real translucent
 * colour is ever needed, add the token to the palette with its own alpha — the
 * `-soft` colours are already `rgba()` and are how this is done here.
 */

const ROOT = join(import.meta.dirname, "..");
const SOURCE_DIRS = ["components", "app", "lib"];
const UTILITIES =
  "bg|text|border|from|to|via|ring|fill|stroke|decoration|divide|outline|shadow|accent|caret|placeholder";

/** The colours tailwind.config.ts declares as a bare `var()`, read from it. */
function customColours(): string[] {
  const config = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
  const names = new Set(
    [...config.matchAll(/"?([a-z0-9-]+)"?\s*:\s*"var\(--[a-z0-9-]+\)"/g)].map((m) => m[1])
  );
  for (const [, key] of config.matchAll(/(\d+)\s*:\s*"var\(--n-\d+\)"/g)) names.add(`n-${key}`);
  return [...names];
}

function sourceFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(full, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.(tsx?|css)$/.test(entry) ? [join(dir, entry)] : [];
  });
}

test("the palette is still declared without <alpha-value>, so modifiers still would not work", () => {
  const config = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");
  assert.ok(
    !config.includes("<alpha-value>"),
    "the palette gained <alpha-value>: modifiers now work, and this test should be replaced by a visual pass over all of them"
  );
});

test("no custom colour carries an opacity modifier", () => {
  const colours = customColours();
  assert.ok(colours.length > 10, "the colour list should have been read from the config");

  const pattern = new RegExp(
    `\\b(${UTILITIES})-(${colours.sort((a, b) => b.length - a.length).join("|")})\\/\\d+\\b`,
    "g"
  );

  const offenders: string[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(dir)) {
      const text = readFileSync(join(ROOT, file), "utf8");
      for (const match of text.matchAll(pattern)) {
        const line = text.slice(0, match.index).split("\n").length;
        offenders.push(`${file}:${line}  ${match[0]}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these compile to nothing — backgrounds render transparent, borders fall back to grey:\n  ${offenders.join(
      "\n  "
    )}`
  );
});

test("Tailwind's own palette is untouched, since those modifiers do work", () => {
  // black/white/transparent and the built-in scales are real colours with real
  // alpha support; the rule above must not have swept them up.
  const sheet = sourceFiles("components")
    .map((file) => readFileSync(join(ROOT, file), "utf8"))
    .join("\n");
  assert.match(sheet, /bg-black\/\d+/, "an existing bg-black/NN should still be there");
});
