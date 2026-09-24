import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * The public site's tab icon, written by scripts/make-studio-icons.ts.
 *
 * An .ico that holds a PNG must hold a 32-bit RGBA one. The first version of
 * this file carried the generator's usual RGB PNG, which browsers happily
 * draw — and which Next.js refuses outright, failing the production build on
 * "The PNG is not in RGBA format". Nothing short of a build noticed, so the
 * format is pinned here where `npm test` sees it.
 */

const ico = readFileSync(new URL("../app/favicon.ico", import.meta.url));

test("favicon.ico is an icon file with one image", () => {
  assert.equal(ico.readUInt16LE(0), 0, "reserved");
  assert.equal(ico.readUInt16LE(2), 1, "type 1 is an icon");
  assert.equal(ico.readUInt16LE(4), 1, "one image");
  assert.equal(ico[6], 32, "32px wide");
  assert.equal(ico[7], 32, "32px tall");
});

test("the image inside is a 32-bit RGBA PNG", () => {
  const offset = ico.readUInt32LE(18);
  const size = ico.readUInt32LE(14);
  assert.equal(offset + size, ico.length, "the entry describes the whole payload");

  const png = ico.subarray(offset);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 32, "width");
  assert.equal(png.readUInt32BE(20), 32, "height");
  assert.equal(png[24], 8, "8 bits per channel");
  assert.equal(png[25], 6, "colour type 6: truecolour with alpha");
});

test("the SVG icon is the same mark", () => {
  const svg = readFileSync(new URL("../app/icon.svg", import.meta.url), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">/);
  assert.match(svg, /fill="#0a0a0a"/, "on the Night paper");
  assert.match(svg, /fill="#ff6b5b"/, "with the red square after the name");
});
