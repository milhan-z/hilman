import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { readTimeMinutes } from "../lib/read-time";
import { needsHtmlToText, readTimeMinutesWith } from "../lib/read-time-core";
import {
  readTimeMinutesFor,
  readTimeMinutesNow,
  useReadTimeMinutes,
} from "../components/admin/read-time";

/**
 * The editor's side of the one reading-time helper.
 *
 * The editor no longer downloads the HTML parser up front, so it counts in
 * two ways: straight away when a document has no Custom HTML, and after
 * fetching lib/read-time.ts when it does. Both have to be the save boundary's
 * number exactly — these pin that, and pin the one thing the editor must never
 * do instead, which is show a count that quietly left a block's words out.
 */

const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
const para = (text: string) => ({ type: "paragraph", data: { text } });
const html = (markup: string) => ({ type: "html", data: { html: markup } });

test("only a Custom HTML block with something in it needs the parser", () => {
  assert.equal(needsHtmlToText({ excerpt: "a deck", blocks: [para("one two")] }), false);
  assert.equal(
    needsHtmlToText({ blocks: [{ type: "markdown", data: { md: "<b>markup</b> in Markdown" } }] }),
    false,
    "Markdown is read without one"
  );
  assert.equal(needsHtmlToText({ blocks: [html("   ")] }), false, "an empty block is skipped first");
  assert.equal(needsHtmlToText({ blocks: [html("<p>words</p>")] }), true);
});

test("without markup the editor's count is the save boundary's, and the parser is never asked for", () => {
  const input = {
    excerpt: "a deck under the title",
    blocks: [
      para(words(350)),
      { type: "markdown", data: { md: `## Heading\n\n${words(100)}` } },
      { type: "quote", data: { text: "worth keeping", source: "someone" } },
    ],
  };
  const refuse = () => {
    throw new Error("the parser was asked for");
  };
  assert.equal(readTimeMinutesWith(input, refuse), readTimeMinutes(input));
  assert.equal(readTimeMinutesNow(input), readTimeMinutes(input));
});

test("with markup the editor waits for the parser rather than guessing", async () => {
  // 198 words before the block and 201 with it: one minute or two, depending
  // on whether the block was read at all.
  const input = { blocks: [para(words(198)), html("<section><p>three more words</p></section>")] };
  assert.equal(readTimeMinutes(input), 2);

  assert.equal(readTimeMinutesNow(input), null, "no number rather than the wrong one");
  assert.equal(await readTimeMinutesFor(input), 2);
  assert.equal(readTimeMinutesNow(input), 2, "and once the parser is here, straight away");
});

test("the first render shows what the server counted, so the browser's first render matches it", () => {
  // The parser is loaded by now (the test above), which is the point: the
  // server never has it in the editor's own module, and neither does the
  // browser while it hydrates, so both must show the number they were given.
  function Label() {
    return React.createElement("span", null, useReadTimeMinutes({ blocks: [html("<p>one two</p>")] }, 7));
  }
  assert.equal(renderToStaticMarkup(React.createElement(Label)), "<span>7</span>");

  function Plain() {
    return React.createElement("span", null, useReadTimeMinutes({ blocks: [para(words(401))] }, 7));
  }
  assert.equal(renderToStaticMarkup(React.createElement(Plain)), "<span>3</span>", "a plain document is simply counted");
});
