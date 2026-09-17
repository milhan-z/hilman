import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_DESTINATIONS,
  PRIMARY_DESTINATIONS,
  SECONDARY_DESTINATIONS,
  isDestinationActive,
} from "../lib/studio-nav";

/**
 * One navigation, two shapes.
 *
 * The phone's tab bar and the desktop rail used to be two hardcoded lists in
 * two files. They reached the same eight routes and disagreed about the names
 * of three of them — `/admin` was "Dashboard" on a laptop and "Home" on a
 * phone — and only one of them could create anything. That is the signature of
 * two products sharing a database, which is the thing this pass is undoing.
 *
 * These tests hold the single list to its contract, and check that both
 * chromes actually read it rather than keeping a copy.
 */

const ROOT = join(import.meta.dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/**
 * The file with its comments taken out.
 *
 * These assertions are about what the code does, and the code is allowed to
 * explain in a comment what it used to do and why it stopped — several of them
 * name the components that were removed. Asserting against the raw text would
 * make an accurate comment fail the build.
 */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

test("every destination is a distinct Studio route", () => {
  const hrefs = ALL_DESTINATIONS.map((d) => d.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "no duplicates");
  for (const href of hrefs) assert.match(href, /^\/admin(\/|$)/);
});

test("ids are unique, because both chromes key on them", () => {
  const ids = ALL_DESTINATIONS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the three the phone puts in the tab bar are the three the rail leads with", () => {
  assert.deepEqual(
    PRIMARY_DESTINATIONS.map((d) => d.label),
    ["Home", "Projects", "Journal"]
  );
});

test("everything else is secondary, and nothing is in both groups", () => {
  const primary = new Set(PRIMARY_DESTINATIONS.map((d) => d.id));
  for (const destination of SECONDARY_DESTINATIONS) {
    assert.equal(primary.has(destination.id), false, `${destination.id} is in both groups`);
  }
  assert.equal(ALL_DESTINATIONS.length, PRIMARY_DESTINATIONS.length + SECONDARY_DESTINATIONS.length);
});

test("Home only lights up on Home, since every Studio route starts with /admin", () => {
  assert.equal(isDestinationActive("/admin", "/admin"), true);
  assert.equal(isDestinationActive("/admin", "/admin/projects"), false);
  assert.equal(isDestinationActive("/admin/projects", "/admin/projects"), true);
  assert.equal(isDestinationActive("/admin/projects", "/admin/projects/abc"), true);
  assert.equal(isDestinationActive("/admin/journal", "/admin/projects"), false);
});

/* ── both chromes read the list rather than repeating it ──── */

test("the desktop rail is built from the shared list", () => {
  const source = read("components/admin/nav.tsx");
  assert.match(source, /from "@\/lib\/studio-nav"/);
  assert.match(source, /PRIMARY_DESTINATIONS\.map/);
  assert.match(source, /SECONDARY_DESTINATIONS\.map/);
});

test("the mobile tab bar is built from the same list", () => {
  const source = read("components/admin/mobile/studio-tab-bar.tsx");
  assert.match(source, /from "@\/lib\/studio-nav"/);
  assert.match(source, /TABS = PRIMARY_DESTINATIONS/);
  assert.match(source, /SECONDARY_DESTINATIONS\.map/);
});

test("neither chrome keeps its own copy of a destination's route", () => {
  // A literal "/admin/settings" in either file would mean the list had been
  // forked again — which is exactly how the two drifted apart last time.
  for (const file of ["components/admin/nav.tsx", "components/admin/mobile/studio-tab-bar.tsx"]) {
    const source = read(file);
    for (const destination of SECONDARY_DESTINATIONS) {
      assert.equal(
        source.includes(`"${destination.href}"`),
        false,
        `${file} hardcodes ${destination.href}`
      );
    }
  }
});

test("the desktop rail can create, which it previously could not", () => {
  const source = read("components/admin/nav.tsx");
  assert.match(source, /QuickCreateSheet/, "the rail opens the same create sheet as the ✛ tab");
});

/* ── the legacy desktop editor is gone, not hidden ─────────── */

test("there is no second block editor left to fall back to", () => {
  assert.throws(
    () => read("components/admin/block-builder.tsx"),
    "block-builder.tsx is the old block-card editor and should no longer exist"
  );
  const editor = code("components/admin/live-editor.tsx");
  assert.equal(editor.includes("<BlockBuilder"), false);
  assert.equal(editor.includes("isVisual"), false, "the Canvas/Form switch is gone");
});

test("one insert affordance, not a pointer one and a touch one", () => {
  const editor = code("components/admin/live-editor.tsx");
  assert.equal(editor.includes("<InsertZone"), false);
  assert.match(editor, /<InlineAdd/);
  assert.equal(
    code("components/admin/insert-zone.tsx").includes("export function InsertZone"),
    false
  );
});

/* ── the shell and its contents switch at the same width ──── */

/**
 * The shell forks at `lg` and the editor's internals used to fork at `sm`, so a
 * 768px window got the mobile fixed shell wrapped around desktop internals —
 * including hover-only controls, on a tablet that has no hover.
 */
test("the editor forks at lg, the same breakpoint as its shell", () => {
  for (const file of [
    "components/admin/live-editor.tsx",
    "components/admin/editable-block.tsx",
  ]) {
    const source = code(file);
    const stray = [...source.matchAll(/className="[^"]*\b(?:sm:hidden|hidden sm:[a-z]+)\b[^"]*"/g)];
    assert.deepEqual(
      stray.map((m) => m[0]),
      [],
      `${file} still forks at sm; the shell forks at lg`
    );
  }
});
