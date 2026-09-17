import assert from "node:assert/strict";
import test from "node:test";
import {
  applyImport,
  describeCounts,
  parseHtmlDocument,
  parseStudioJson,
} from "../lib/studio-import";
import { parseMarkdownDocument } from "../lib/studio-import-markdown";
import type { Block } from "../lib/types";

/**
 * What a pasted document is allowed to do to the studio.
 *
 * The answer is: become blocks, and nothing else. It cannot claim to be an
 * existing row, it cannot arrive published, and it cannot bring anything that
 * executes. These tests are the enforcement.
 */

const ok = (outcome: ReturnType<typeof parseStudioJson>) => {
  assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  return outcome.ok ? outcome.summary : (null as never);
};

/* ── Studio JSON ──────────────────────────────────────────── */

const valid = JSON.stringify({
  version: 1,
  kind: "project",
  title: "My project",
  blocks: [
    { type: "heading", data: { level: 2, text: "Overview" } },
    { type: "paragraph", data: { text: "Hello." } },
  ],
});

test("a valid document becomes blocks with a title", () => {
  const summary = ok(parseStudioJson(valid, "project"));
  assert.equal(summary.title, "My project");
  assert.equal(summary.blocks.length, 2);
  assert.equal(summary.blocks[0].type, "heading");
});

test("imported blocks get fresh ids and sequential positions", () => {
  const summary = ok(
    parseStudioJson(
      JSON.stringify({
        version: 1,
        blocks: [
          { type: "paragraph", data: { text: "a" }, id: "SHOULD-NOT-SURVIVE", position: 99 },
          { type: "paragraph", data: { text: "b" } },
        ],
      }),
      "project"
    )
  );
  assert.deepEqual(summary.blocks.map((b) => b.position), [0, 1]);
  assert.ok(summary.blocks.every((b) => b.id !== "SHOULD-NOT-SURVIVE"));
  assert.notEqual(summary.blocks[0].id, summary.blocks[1].id);
});

test("publication and identity fields are ignored and named", () => {
  const summary = ok(
    parseStudioJson(
      JSON.stringify({
        version: 1,
        status: "published",
        id: "aaaa",
        owner_id: "bbbb",
        published_at: "2020-01-01",
        blocks: [{ type: "paragraph", data: { text: "x" } }],
      }),
      "project"
    )
  );
  for (const key of ["status", "id", "owner_id", "published_at"]) {
    assert.ok(summary.refused.includes(key), `${key} should be refused`);
  }
  // And nothing about them reached the blocks.
  assert.equal(JSON.stringify(summary.blocks).includes("published"), false);
});

test("a journal document is refused while editing a project", () => {
  const outcome = parseStudioJson(JSON.stringify({ version: 1, kind: "journal", blocks: [] }), "project");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.error, /journal .* project/i);
});

test("an unknown version is refused rather than guessed at", () => {
  const outcome = parseStudioJson(JSON.stringify({ version: 7, blocks: [] }), "project");
  assert.equal(outcome.ok, false);
});

test("broken JSON gives a readable error and no blocks", () => {
  const outcome = parseStudioJson("{ not json", "project");
  assert.equal(outcome.ok, false);
  if (!outcome.ok) assert.match(outcome.error, /valid JSON/i);
});

test("unknown block types are skipped with a warning, not silently dropped", () => {
  const summary = ok(
    parseStudioJson(
      JSON.stringify({
        version: 1,
        blocks: [
          { type: "paragraph", data: { text: "keep" } },
          { type: "carousel", data: {} },
        ],
      }),
      "project"
    )
  );
  assert.equal(summary.blocks.length, 1);
  assert.equal(summary.warnings.length, 1);
  assert.match(summary.warnings[0], /carousel/);
});

test("a document with nothing usable is refused", () => {
  const outcome = parseStudioJson(JSON.stringify({ version: 1, blocks: [{ type: "nope" }] }), "project");
  assert.equal(outcome.ok, false);
});

test("html arriving inside JSON is sanitised like any other markup", () => {
  const summary = ok(
    parseStudioJson(
      JSON.stringify({
        version: 1,
        blocks: [{ type: "html", data: { html: '<p>hi</p><script>alert(1)</script>' } }],
      }),
      "project"
    )
  );
  const html = String(summary.blocks[0].data.html);
  assert.doesNotMatch(html, /script|alert/i);
  assert.match(html, /hi/);
});

/* ── HTML ─────────────────────────────────────────────────── */

test("pasted html becomes one sanitised Custom HTML block", () => {
  const outcome = parseHtmlDocument('<section><h2>Hello</h2><p>Custom content</p></section>');
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.summary.blocks.length, 1);
  assert.equal(outcome.summary.blocks[0].type, "html");
  assert.match(String(outcome.summary.blocks[0].data.html), /<h2>Hello<\/h2>/);
});

test("html that is only a script is refused outright", () => {
  const outcome = parseHtmlDocument("<script>alert(1)</script>");
  assert.equal(outcome.ok, false);
});

test("html import says when it removed something", () => {
  const outcome = parseHtmlDocument('<p>hi</p><script>alert(1)</script>');
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.ok(outcome.summary.warnings.some((w) => /removed/i.test(w)));
});

/* ── Markdown ─────────────────────────────────────────────── */

test("markdown maps onto the blocks that exist", () => {
  const outcome = parseMarkdownDocument(
    ["# Title", "", "## Section", "", "Some text.", "", "> A quote", "", "---", "", "```ts", "const a = 1;", "```"].join("\n")
  );
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.summary.title, "Title");
  assert.deepEqual(
    outcome.summary.blocks.map((b) => b.type),
    ["heading", "paragraph", "quote", "divider", "code"]
  );
  assert.equal(outcome.summary.blocks[4].data.language, "ts");
});

test("unsupported markdown is kept as markdown and reported", () => {
  const outcome = parseMarkdownDocument("| a | b |\n| - | - |\n| 1 | 2 |");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.summary.blocks[0].type, "markdown");
  assert.ok(outcome.summary.warnings.some((w) => /table/i.test(w)));
});

test("a lone image paragraph becomes an image block", () => {
  const outcome = parseMarkdownDocument("![a cat](https://x.test/cat.png)");
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.summary.blocks[0].type, "image");
  assert.equal(outcome.summary.blocks[0].data.alt, "a cat");
});

test("empty markdown is refused", () => {
  assert.equal(parseMarkdownDocument("   ").ok, false);
});

/* ── joining it to what is already there ──────────────────── */

const block = (id: string): Block => ({ id, type: "paragraph", position: 0, data: {} });

test("append keeps existing blocks and renumbers everything", () => {
  const result = applyImport([block("a"), block("b")], [block("c")], "append");
  assert.deepEqual(result.map((b) => b.id), ["a", "b", "c"]);
  assert.deepEqual(result.map((b) => b.position), [0, 1, 2]);
});

test("replace drops the working blocks, and only when asked", () => {
  const result = applyImport([block("a"), block("b")], [block("c")], "replace");
  assert.deepEqual(result.map((b) => b.id), ["c"]);
  assert.deepEqual(result.map((b) => b.position), [0]);
});

test("counts are described in words people use", () => {
  assert.deepEqual(
    describeCounts([
      { type: "heading", count: 4 },
      { type: "paragraph", count: 1 },
      { type: "image", count: 2 },
    ]),
    ["4 headings", "1 text", "2 photos"]
  );
});
