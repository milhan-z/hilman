import assert from "node:assert/strict";
import test from "node:test";
import { parseHtmlDocument, type ImportOutcome } from "../lib/studio-import";
import { convertHtmlToBlocks } from "../lib/studio-import-html";
import { sanitizeStudioHtml } from "../lib/studio-html";
import { marked } from "marked";
import type { Block, BlockType } from "../lib/types";

/**
 * Turning a page into blocks, and saying so when it cannot.
 *
 * Two properties are being defended here. The first is that conversion is
 * honest: every piece of content that changed shape, lost formatting or stayed
 * as markup is named in the warnings, because content that silently became
 * something else is the failure this whole path is designed to avoid.
 *
 * The second is that conversion is not a way around the allowlist. A <script>
 * must not survive as a block, and it must not survive as the *text* of a
 * block either — flattening tags to their words is exactly the kind of step
 * that would otherwise turn removed markup back into visible content.
 */

const ok = (outcome: ImportOutcome) => {
  assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  return outcome.ok ? outcome.summary : (null as never);
};

const types = (blocks: Block[]): BlockType[] => blocks.map((block) => block.type);
const mentions = (warnings: string[], needle: string) =>
  warnings.some((warning) => warning.toLowerCase().includes(needle.toLowerCase()));

/* ── the structural mapping ───────────────────────────────── */

test("an article becomes the blocks it is made of", () => {
  const summary = ok(
    parseHtmlDocument(
      `<article>
         <h1>The title</h1>
         <h2>A section</h2>
         <p>Some words.</p>
         <hr>
         <blockquote><p>Quoted.</p><cite>— Someone</cite></blockquote>
       </article>`,
      "blocks"
    )
  );

  assert.equal(summary.title, "The title");
  assert.deepEqual(types(summary.blocks), ["heading", "paragraph", "divider", "quote"]);
  assert.equal(summary.blocks[0].data.level, 2);
  assert.equal(summary.blocks[3].data.text, "Quoted.");
  assert.equal(summary.blocks[3].data.source, "Someone");
});

test("wrappers are walked through, not turned into blocks", () => {
  const summary = ok(
    parseHtmlDocument(
      "<div><section><div><p>Only one paragraph here.</p></div></section></div>",
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["paragraph"]);
});

test("headings deeper than the site supports are clamped and say so", () => {
  const summary = ok(parseHtmlDocument("<h6>Deep</h6>", "blocks"));
  assert.equal(summary.blocks[0].data.level, 4);
  assert.ok(mentions(summary.warnings, "level 4"));
});

test("a second h1 is a heading, not a second title", () => {
  const summary = ok(parseHtmlDocument("<h1>One</h1><h1>Two</h1>", "blocks"));
  assert.equal(summary.title, "One");
  assert.deepEqual(types(summary.blocks), ["heading"]);
  assert.equal(summary.blocks[0].data.text, "Two");
});

test("loose text beside block elements is not lost", () => {
  const summary = ok(parseHtmlDocument("<div>Stray words<h2>Then a heading</h2></div>", "blocks"));
  assert.deepEqual(types(summary.blocks), ["paragraph", "heading"]);
  assert.equal(summary.blocks[0].data.text, "Stray words");
});

/* ── inline formatting ────────────────────────────────────── */

test("inline markup becomes inline Markdown", () => {
  const summary = ok(
    parseHtmlDocument(
      '<p>A <strong>bold</strong> <em>idea</em> in <code>code</code>, see <a href="https://x.test">this</a>.</p>',
      "blocks"
    )
  );
  assert.equal(
    summary.blocks[0].data.text,
    "A **bold** *idea* in `code`, see [this](https://x.test)."
  );
});

test("Markdown characters in the words are escaped, not applied", () => {
  const summary = ok(parseHtmlDocument("<p>Call __init__ then *args.</p>", "blocks"));
  assert.equal(summary.blocks[0].data.text, "Call \\_\\_init\\_\\_ then \\*args.");
});

test("formatting with no Markdown equivalent keeps its words and is reported", () => {
  const summary = ok(parseHtmlDocument("<p>A <mark>highlighted</mark> word.</p>", "blocks"));
  assert.equal(summary.blocks[0].data.text, "A highlighted word.");
  assert.ok(mentions(summary.warnings, "flattened"));
});

/* ── photos ───────────────────────────────────────────────── */

test("a figure becomes one image block with its caption", () => {
  const summary = ok(
    parseHtmlDocument(
      '<figure><img src="https://x.test/a.jpg" alt="A thing" width="800" height="600"><figcaption>How it looked</figcaption></figure>',
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["image"]);
  const data = summary.blocks[0].data;
  assert.equal(data.public_id, "https://x.test/a.jpg");
  assert.equal(data.alt, "A thing");
  assert.equal(data.caption, "How it looked");
});

/**
 * Dimensions from a pasted page describe that page, not this one — see
 * pushImage() in lib/studio-import-html.ts. (This used to also be a safety
 * rule, because `data.width` meant two things at once; lib/block-layout.ts
 * fixed that, and tests/block-layout.test.ts is where the separation is
 * defended now.)
 */
test("an image never carries width or height from the markup", () => {
  const summary = ok(
    parseHtmlDocument('<img src="https://x.test/a.jpg" width="800" height="600">', "blocks")
  );
  const data = summary.blocks[0].data;
  assert.equal("width" in data, false);
  assert.equal("height" in data, false);
});

test("a relative image address is called out, because the site cannot load it", () => {
  const summary = ok(parseHtmlDocument('<p><img src="/local/a.jpg"></p>', "blocks"));
  assert.deepEqual(types(summary.blocks), ["image"]);
  assert.ok(mentions(summary.warnings, "relative"));
});

/* ── things with no block of their own ────────────────────── */

test("lists are kept as Markdown, nesting and numbering intact", () => {
  const summary = ok(
    parseHtmlDocument(
      "<ol start='3'><li>Third<ul><li>Nested</li></ul></li><li>Fourth</li></ol>",
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["markdown"]);
  assert.equal(summary.blocks[0].data.md, "3. Third\n  - Nested\n4. Fourth");
  assert.ok(mentions(summary.warnings, "list"));
});

test("a table stays as markup, because converting one loses its structure", () => {
  const summary = ok(
    parseHtmlDocument(
      '<table><tr><th scope="col">A</th></tr><tr><td colspan="2">B</td></tr></table>',
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["html"]);
  const html = String(summary.blocks[0].data.html);
  assert.match(html, /colspan="2"/);
  assert.match(html, /scope="col"/);
  assert.ok(mentions(summary.warnings, "Custom HTML"));
});

test("native blocks and Custom HTML come out of the same document together", () => {
  const summary = ok(
    parseHtmlDocument(
      "<h2>Results</h2><p>Here they are.</p><table><tr><td>1</td></tr></table><p>After.</p>",
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["heading", "paragraph", "html", "paragraph"]);
});

test("code keeps its newlines and its language", () => {
  const summary = ok(
    parseHtmlDocument(
      '<pre><code class="language-ts">const a = 1;\nconst b = 2;</code></pre>',
      "blocks"
    )
  );
  assert.deepEqual(types(summary.blocks), ["code"]);
  assert.equal(summary.blocks[0].data.language, "ts");
  assert.equal(summary.blocks[0].data.code, "const a = 1;\nconst b = 2;");
});

/* ── conversion is not a way around the allowlist ─────────── */

test("a script does not survive conversion, as a block or as text", () => {
  const summary = ok(
    parseHtmlDocument(
      '<p>Before</p><script>alert(1)</script><p onclick="steal()">After</p>',
      "blocks"
    )
  );
  const serialised = JSON.stringify(summary.blocks);
  assert.equal(serialised.includes("alert"), false);
  assert.equal(serialised.includes("onclick"), false);
  assert.equal(serialised.includes("steal"), false);
  assert.deepEqual(types(summary.blocks), ["paragraph", "paragraph"]);
});

test("markup kept as an HTML block is sanitised markup", () => {
  const { entries } = convertHtmlToBlocks(
    '<table><tr><td><script>alert(1)</script>Cell</td></tr></table>'
  );
  assert.equal(entries.length, 1);
  assert.equal(String(entries[0].data.html).includes("script"), false);
  assert.match(String(entries[0].data.html), /Cell/);
});

test("a page of nothing but script converts to nothing, and says so", () => {
  const outcome = parseHtmlDocument("<script>alert(1)</script>", "blocks");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.error, /Nothing convertible/);
});

/* ── the other mode is unchanged ──────────────────────────── */

test("keeping it whole still produces exactly one Custom HTML block", () => {
  const summary = ok(parseHtmlDocument("<h2>A</h2><p>B</p><table><tr><td>C</td></tr></table>"));
  assert.deepEqual(types(summary.blocks), ["html"]);
  assert.ok(mentions(summary.warnings, "one Custom HTML block"));
});

test("the default mode is still whole, so nothing that called this changed", () => {
  const explicit = ok(parseHtmlDocument("<p>Same</p>", "whole"));
  const implied = ok(parseHtmlDocument("<p>Same</p>"));
  assert.deepEqual(types(explicit.blocks), types(implied.blocks));
});

/* ── an import is still an edit, never a publication ───────── */

test("converted blocks get fresh ids and ordered positions", () => {
  const summary = ok(parseHtmlDocument("<p>One</p><p>Two</p><p>Three</p>", "blocks"));
  assert.deepEqual(
    summary.blocks.map((block) => block.position),
    [0, 1, 2]
  );
  assert.equal(new Set(summary.blocks.map((block) => block.id)).size, 3);
  for (const block of summary.blocks) assert.match(block.id, /^import-/);
});

/* ── the whole round trip, adversarially ──────────────────── */

/**
 * Conversion produces five kinds of string, and each one reaches the page by a
 * different route: `paragraph.text` and `markdown.md` through <Prose />,
 * `html.html` through the renderer's own sanitiser, and `heading.text`,
 * `quote.text` and `code.code` as React text nodes. This checks the two that
 * are rendered as markup are safe after the render step they actually get, and
 * that the plain-text ones contain no markup to begin with.
 */
test("nothing a hostile document produces can execute once rendered", () => {
  const hostile = `
    <h1 onload="x()">Title<script>alert(1)</script></h1>
    <h2><img src=x onerror="alert(2)">Section</h2>
    <p>Text <a href="javascript:alert(3)">link</a> and <a href="https://ok.test">ok</a>.</p>
    <p><iframe src="https://evil.test"></iframe></p>
    <ul><li><script>alert(4)</script>Item</li></ul>
    <table><tr><td onclick="alert(5)"><style>body{display:none}</style>Cell</td></tr></table>
    <pre><code>&lt;script&gt;alert(6)&lt;/script&gt;</code></pre>
    <blockquote><p>Quoted<script>alert(7)</script></p></blockquote>
  `;

  const summary = ok(parseHtmlDocument(hostile, "blocks"));

  for (const block of summary.blocks) {
    const data = block.data ?? {};

    if (block.type === "paragraph" || block.type === "markdown") {
      const rendered = sanitizeStudioHtml(
        marked.parse(String(data.text ?? data.md ?? ""), { async: false }) as string
      );
      assert.equal(/<\s*script/i.test(rendered), false, `script survived a ${block.type}`);
      assert.equal(/\son[a-z]+\s*=/i.test(rendered), false, `a handler survived a ${block.type}`);
      assert.equal(/javascript\s*:/i.test(rendered), false, `a javascript: URL survived a ${block.type}`);
      continue;
    }

    if (block.type === "html") {
      const rendered = sanitizeStudioHtml(String(data.html ?? ""));
      assert.equal(/<\s*script/i.test(rendered), false);
      assert.equal(/<\s*style/i.test(rendered), false);
      assert.equal(/\son[a-z]+\s*=/i.test(rendered), false);
      continue;
    }

    // Everything else is rendered as text by React, so the only thing to check
    // is that the importer did not put markup into a field that will never be
    // sanitised again.
    for (const value of Object.values(data)) {
      if (typeof value !== "string") continue;
      if (block.type === "code") continue; // A code sample is allowed to contain tags.
      assert.equal(/<\s*(script|iframe|style)/i.test(value), false, `markup in ${block.type}`);
    }
  }

  // The code sample keeps its text, decoded, and it is still only text.
  const code = summary.blocks.find((block) => block.type === "code");
  assert.equal(String(code?.data.code), "<script>alert(6)</script>");
});

test("a javascript: link is gone before the paragraph is built", () => {
  const summary = ok(
    parseHtmlDocument('<p><a href="javascript:alert(1)">click</a> and <a href="https://ok.test">ok</a></p>', "blocks")
  );
  const text = String(summary.blocks[0].data.text);
  assert.equal(text.includes("javascript:"), false);
  assert.ok(text.includes("[ok](https://ok.test)"));
});
