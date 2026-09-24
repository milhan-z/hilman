import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import cloudinaryLoader from "../lib/cloudinary-loader";
import { DELIVERY_URL, isCloudinaryDelivery } from "../lib/cloudinary";

/**
 * next/image asks this loader for one URL per srcset width. The contract is
 * narrow on purpose: rewrite the width of the one transform mediaSrc() builds,
 * and leave every other URL exactly as it was given.
 */

const OWN = "https://res.cloudinary.com/hilman/image/upload/f_auto,q_auto,w_1600,c_limit/works/paper-trail/cover";

test("each srcset width asks Cloudinary for that width", () => {
  assert.equal(
    cloudinaryLoader({ src: OWN, width: 640 }),
    "https://res.cloudinary.com/hilman/image/upload/f_auto,q_auto,w_640,c_limit/works/paper-trail/cover"
  );
  assert.equal(
    cloudinaryLoader({ src: OWN, width: 3840 }),
    "https://res.cloudinary.com/hilman/image/upload/f_auto,q_auto,w_3840,c_limit/works/paper-trail/cover",
    "c_limit stays, so a large srcset entry never upscales the original"
  );
});

test("quality: the URL's own unless next/image names one", () => {
  const custom = OWN.replace("q_auto", "q_auto:good");
  assert.match(cloudinaryLoader({ src: custom, width: 828 }), /f_auto,q_auto:good,w_828,c_limit\//);
  assert.match(cloudinaryLoader({ src: OWN, width: 828, quality: 60 }), /f_auto,q_60,w_828,c_limit\//);
});

test("a public_id with folders and dots survives intact", () => {
  const src = "https://res.cloudinary.com/hilman/image/upload/f_auto,q_auto,w_900,c_limit/hilman/2026/05/evening.v2";
  assert.ok(cloudinaryLoader({ src, width: 256 }).endsWith(",w_256,c_limit/hilman/2026/05/evening.v2"));
});

test("only mediaSrc()'s own URLs are rewritten", () => {
  const pasted = [
    // A crop the author chose must not be swapped for a plain resize.
    "https://res.cloudinary.com/hilman/image/upload/c_fill,g_face,w_300,h_300/portrait.jpg",
    "https://res.cloudinary.com/hilman/image/upload/v1712345678/portrait.jpg",
    "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    "https://example.com/photo.jpg",
  ];
  for (const src of pasted) {
    assert.equal(isCloudinaryDelivery(src), false, `${src} is not ours to resize`);
    assert.equal(cloudinaryLoader({ src, width: 640 }), src, "and passes through untouched");
  }
  assert.equal(isCloudinaryDelivery(OWN), true);
});

test("the pattern matches what mediaSrc() actually writes", () => {
  // The loader and mediaSrc() must agree on the transform's shape; if
  // mediaSrc() ever changes its string, this is what notices.
  const source = readFileSync(new URL("../lib/cloudinary.ts", import.meta.url), "utf8");
  assert.match(source, /const t = \["f_auto", `q_\$\{opts\.quality \?\? "auto"\}`\];/);
  assert.match(source, /t\.push\(`w_\$\{opts\.width\}`, "c_limit"\)/);
  assert.ok(DELIVERY_URL.test(OWN));
});

test("<Pic /> sends only Cloudinary delivery URLs through the loader", () => {
  const pic = readFileSync(new URL("../components/cld-image.tsx", import.meta.url), "utf8");
  assert.match(pic, /const unoptimized = !isCloudinaryDelivery\(resolved\);/);
  assert.equal((pic.match(/unoptimized=\{unoptimized\}/g) ?? []).length, 2, "both the fill and the sized image");

  const config = readFileSync(new URL("../next.config.mjs", import.meta.url), "utf8");
  assert.match(config, /loaderFile: "\.\/lib\/cloudinary-loader\.ts"/);
});
