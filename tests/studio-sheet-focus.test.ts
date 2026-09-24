import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Typing into a sheet keeps the keyboard.
 *
 * The sheet's focus effect listed `onClose` as a dependency, and every caller
 * passes a fresh arrow — `onClose={() => setDetailsOpen(false)}` — on every
 * render. The editor re-renders on every keystroke, so each letter typed into
 * the Details sheet re-ran the effect: focus was handed back to the button
 * behind the sheet and then to the panel. On a phone that closes the keyboard
 * after one character, which made every text field in the Details sheet — the
 * description, the tags — impossible to type into. Found by driving the sheet
 * in a browser; pinned here so the dependency does not creep back.
 */

const code = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

test("the sheet's focus effect runs when it opens, not when its caller re-renders", () => {
  const sheet = code("components/admin/mobile-sheet.tsx");
  const effect = sheet.slice(sheet.indexOf("panel.current?.focus()"));
  const deps = effect.match(/\}, \[([^\]]*)\]\);/);
  assert.ok(deps, "the focus effect has a dependency list");
  assert.deepEqual(
    deps[1].split(",").map((dep) => dep.trim()),
    ["open"],
    "only `open` — a callback here moves focus on every keystroke"
  );
  assert.match(sheet, /useEffectEvent\(/, "Escape still reaches the current onClose");
});
