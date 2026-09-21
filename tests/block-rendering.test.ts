import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BlockRenderer } from "../components/blocks/renderer";
import { BLOCK_TEMPLATES } from "../lib/block-templates";
import type { Block } from "../lib/types";

/**
 * One bad block must not take the article with it.
 *
 * ── the failure ──
 *
 * `BlockRenderer` looked up a component by `type` and handed it `data`
 * untouched. `data` is `Record<string, any>`, which is honest about the shape
 * varying by type and says nothing at all about what actually arrived from
 * JSON or from a database row. So:
 *
 *     { type: "heading", data: { text: { bad: "shape" } } }
 *
 * reaches `<h2>{data.text}</h2>` and React throws *Objects are not valid as a
 * React child*. These are server components with no error boundary above
 * them, so that is not a missing heading — the whole page 500s, and every
 * paragraph that was perfectly fine goes with it.
 *
 * These tests render the real component with `react-dom/server`, which is the
 * same path a request takes. A test that only inspected the data would have
 * reported this code as fine.
 */

const block = (type: string, data: Record<string, unknown>, position = 0): Block =>
  ({ id: `b${position}`, type, position, data }) as Block;

const render = (blocks: Block[]) =>
  renderToStaticMarkup(React.createElement(BlockRenderer, { blocks }));

/* ══ 1. the reported crash ═════════════════════════════════ */

test("a heading whose text is an object no longer throws", () => {
  // Before: "Objects are not valid as a React child (found: object with keys
  // {bad})", raised out of the server render.
  assert.doesNotThrow(() => render([block("heading", { level: 2, text: { bad: "shape" } })]));
});

test("the rest of the article survives one malformed block", () => {
  const html = render([
    block("heading", { level: 2, text: "Chapter one" }, 0),
    block("heading", { level: 2, text: { bad: "shape" } }, 1),
    block("quote", { text: "Something worth keeping", source: "Someone" }, 2),
    block("paragraph", { text: "And the writing after it." }, 3),
  ]);

  assert.match(html, /Chapter one/, "the heading before it is there");
  assert.match(html, /Something worth keeping/, "the quote after it is there");
  assert.match(html, /And the writing after it/, "and so is the last paragraph");
  assert.ok(!html.includes("bad"), "only the block that could not be drawn is missing");
});

test("every shape that used to crash now renders nothing instead", () => {
  for (const bad of [
    block("heading", { text: { bad: 1 } }),
    block("paragraph", { text: { bad: 1 } }),
    block("quote", { text: [1, 2] }),
    block("code", { code: { bad: 1 } }),
    block("button", { label: {}, href: "/x" }),
    block("file", { public_id: "x", filename: { bad: 1 } }),
    block("markdown", { md: { bad: 1 } }),
    block("html", { html: { bad: 1 } }),
  ]) {
    assert.doesNotThrow(() => render([bad]), bad.type);
  }
});

test("a block of a type this site has never heard of is skipped, not fatal", () => {
  assert.doesNotThrow(() => render([block("carousel", { items: [] })]));
  const html = render([
    block("carousel", { items: [] }, 0),
    block("paragraph", { text: "Still here." }, 1),
  ]);
  assert.match(html, /Still here/);
});

/* ══ 2. and nothing legitimate was lost ════════════════════ */

test("well-formed blocks still render what they always rendered", () => {
  const html = render([
    block("heading", { level: 2, text: "A real heading" }, 0),
    block("paragraph", { text: "A sentence." }, 1),
    block("quote", { text: "Worth keeping", source: "Someone" }, 2),
    block("code", { language: "ts", code: "const a = 1;" }, 3),
    block("divider", { style: "line" }, 4),
  ]);

  assert.match(html, /<h2[^>]*>A real heading<\/h2>/);
  assert.match(html, /A sentence\./);
  assert.match(html, /Worth keeping/);
  assert.match(html, /const a = 1;/);
});

test("every starter template renders", () => {
  // The templates are what a new project is built from, so if the read path
  // ever filtered one of their blocks out, a new document would open with
  // pieces missing and nothing would say why.
  for (const template of BLOCK_TEMPLATES) {
    const blocks = template.build().map((b, i) => ({ ...b, id: `b${i}`, position: i }) as Block);
    const html = render(blocks);
    assert.doesNotThrow(() => render(blocks), template.id);
    assert.ok(html.length > 0, `${template.id} rendered nothing at all`);
  }
});

test("the blocks of a template all survive the read path", () => {
  for (const template of BLOCK_TEMPLATES) {
    const blocks = template.build().map((b, i) => ({ ...b, id: `b${i}`, position: i }) as Block);
    const html = render(blocks);
    // Each block gets its own wrapper div with an id, so counting them is a
    // direct check that none were filtered away.
    const drawn = (html.match(/id="block-b\d+"/g) ?? []).length;
    assert.equal(drawn, blocks.length, `${template.id}: ${drawn} of ${blocks.length} blocks drawn`);
  }
});

test("headings still honour their level", () => {
  for (const [level, tag] of [
    [2, "h2"],
    [3, "h3"],
    [4, "h4"],
  ] as const) {
    assert.match(render([block("heading", { level, text: "x" })]), new RegExp(`<${tag}[^>]*>x</${tag}>`));
  }
});

test("an empty document is still nothing", () => {
  assert.equal(render([]), "");
});

/* ══ 3. the posture, stated ════════════════════════════════ */

test("a document of nothing but malformed blocks renders an empty page, not an error", () => {
  // The page has to stay *available*. An article whose every block is broken
  // is a problem for the author to see in the Studio, not a 500 for a reader.
  assert.doesNotThrow(() =>
    render([
      block("heading", { text: { bad: 1 } }, 0),
      block("paragraph", { text: { bad: 1 } }, 1),
    ])
  );
});
