import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DOODLES, InkDoodle } from "../components/bits/ink-doodle";

/**
 * InkDoodle: the Lottie drawings in public/lottie, drawn once as they come
 * into view — and a finished drawing for everyone the player never reaches.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("every doodle has its animation and its finished drawing, at the size it declares", () => {
  for (const [name, [width, height]] of Object.entries(DOODLES)) {
    const data = JSON.parse(read(`public/lottie/${name}.json`));
    assert.deepEqual([data.w, data.h], [width, height], name);
    assert.ok(readFileSync(new URL(`../public/lottie/${name}.json`, import.meta.url)).length < 25_000, `${name} stays small`);
    // The light player has no expressions and no effects: nothing may need them.
    const json = JSON.stringify(data);
    assert.ok(!/"x":"/.test(json), `${name} has no expressions`);
    assert.ok(!/"ef":\[\{/.test(json), `${name} has no effects`);
    assert.ok(!data.assets?.some((asset: { p?: string }) => asset.p), `${name} has no images`);
    const poster = read(`public/lottie/${name}.svg`);
    assert.match(poster, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg"[^>]*viewBox="0 0 ${width} ${height}"`), `${name}.svg is its last frame`);
  }
  const files = readdirSync(new URL("../public/lottie", import.meta.url)).filter((f) => f.endsWith(".json"));
  assert.deepEqual(files.map((f) => f.replace(".json", "")).sort(), Object.keys(DOODLES).sort(), "and nothing is shipped that is not used");
});

test("the server sends the finished drawing, decoration only", () => {
  const out = renderToStaticMarkup(React.createElement(InkDoodle, { name: "paper-plane", className: "w-56" }));
  assert.ok(!out.includes('rel="preload"'), "lazy, so React never preloads it ahead of the page's own images");
  assert.equal(
    out,
    '<span aria-hidden="true" class="bits-doodle w-56" style="aspect-ratio:320 / 200"><img class="bits-doodle-poster" src="/lottie/paper-plane.svg" alt="" width="320" height="200" loading="lazy" decoding="async"/><span class="bits-doodle-stage"></span></span>'
  );
});

test("the image is held back only where motion is welcome and scripts run", () => {
  const css = read("components/bits/bits.css");
  assert.match(
    css,
    /@media screen and \(prefers-reduced-motion: no-preference\) and \(scripting: enabled\) \{\s*\.bits-doodle:not\(\[data-bits-doodle="still"\]\) > \.bits-doodle-poster \{\s*opacity: 0;/
  );
  const doodle = read("components/bits/ink-doodle.tsx");
  assert.match(doodle, /prefers-reduced-motion: reduce\)"\)\.matches\) \{\s*still\(\);\s*return;/, "reduced motion: the image, and no player");
  assert.match(doodle, /\.catch\(still\)/, "a player that fails to load hands the image back");
});

test("the player is its own chunk, fetched by the doodle and nothing else", () => {
  assert.match(read("components/bits/ink-doodle.tsx"), /import\("\.\/ink-doodle-player"\)/);
  assert.match(read("components/bits/ink-doodle-player.ts"), /^import lottie from "lottie-web\/build\/player\/lottie_light";/m, "the light SVG build");
  const users: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(entry.name) && /from ["']lottie-web|import\(["']lottie-web/.test(read(path))) users.push(path);
    }
  };
  for (const dir of ["app", "components", "lib"]) if (existsSync(new URL(`../${dir}`, import.meta.url))) walk(dir);
  assert.deepEqual(users, ["components/bits/ink-doodle-player.ts"]);
});

test("where the doodles are", () => {
  assert.match(read("app/(site)/page.tsx"), /<InkDoodle name="notebook-doodle"/, "Home, between the hero and the work");
  assert.match(read("components/about-sheet.tsx"), /<InkDoodle name="pencil-scribble"/, "About, under the handwritten story");
  assert.match(read("components/connect-form.tsx"), /className="paper-cut[^"]*">\s*<InkDoodle name="paper-plane"/, "Connect, on the thank-you slip");
  assert.match(read("app/not-found.tsx"), /<InkDoodle name="notebook-flip"/, "the page that is not there");
});
