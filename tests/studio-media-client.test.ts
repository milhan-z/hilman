import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 0015 makes registry metadata owner-only (SQL role behavior is covered in
// media-privacy.test.ts). A cookie-less public client silently returns an
// empty library even to the signed-in owner, so both picker entry points must
// use the existing SSR browser client that carries that session.
for (const path of [
  "components/admin/media-selector-modal.tsx",
  "components/admin/mobile/media-picker-sheet.tsx",
]) {
  test(`${path} reads the private media registry with the browser session`, () => {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " ");
    assert.match(source, /import\s*\{\s*createBrowserSupabase\s*\}\s*from\s*["']@\/lib\/supabase\/client["']/);
    assert.match(source, /const sb = createBrowserSupabase\(\)/);
    assert.match(source, /sb\s*\.from\("media"\)/);
    assert.doesNotMatch(source, /createPublicClient|@\/lib\/supabase\/public/);
  });
}
