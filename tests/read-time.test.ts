import assert from "node:assert/strict";
import test from "node:test";
import {
  WORDS_PER_MINUTE,
  countWords,
  readTimeLabel,
  readTimeMinutes,
  readableText,
} from "../lib/read-time";
import { BLOCK_TEMPLATES } from "../lib/block-templates";

/**
 * Reading time, counted rather than claimed.
 *
 * It used to be a number field in the metadata panel, which made it the
 * author's job to keep a derived value correct. The risk in deriving it is the
 * opposite one: a block's data is full of strings that are not words — a
 * Cloudinary id, a URL, an alt attribute, the tags inside a Custom HTML block —
 * and counting those would produce a confident, wrong number instead of an
 * honest guess. These tests are mostly about what must *not* be counted.
 */

const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(" ");
const para = (text: string) => ({ type: "paragraph" as const, data: { text } });

/* ── the formula ──────────────────────────────────────────── */

test("the constant is the one the codebase already used", () => {
  assert.equal(WORDS_PER_MINUTE, 200);
});

test("minutes round up, and a short note is never zero", () => {
  assert.equal(readTimeMinutes({ blocks: [] }), 1);
  assert.equal(readTimeMinutes({ blocks: [para("")] }), 1);
  assert.equal(readTimeMinutes({ blocks: [para(words(1))] }), 1);
  assert.equal(readTimeMinutes({ blocks: [para(words(200))] }), 1);
  assert.equal(readTimeMinutes({ blocks: [para(words(201))] }), 2);
  assert.equal(readTimeMinutes({ blocks: [para(words(400))] }), 2);
  assert.equal(readTimeMinutes({ blocks: [para(words(401))] }), 3);
  assert.equal(readTimeMinutes({ blocks: [para(words(2000))] }), 10);
});

test("the label is the phrase the site shows", () => {
  assert.equal(readTimeLabel(4), "4 min read");
});

/* ── what counts ──────────────────────────────────────────── */

test("the excerpt counts, because the article renders it under the title", () => {
  assert.equal(countWords(readableText({ excerpt: "One two three", blocks: [] })), 3);
});

test("prose blocks count", () => {
  const blocks = [
    { type: "heading", data: { level: 2, text: "One two" } },
    para("three four five"),
    { type: "quote", data: { text: "six seven", source: "eight" } },
    { type: "markdown", data: { md: "nine ten" } },
  ];
  assert.equal(countWords(readableText({ blocks })), 10);
});

test("readable text from a Custom HTML block counts, its markup does not", () => {
  const blocks = [
    { type: "html", data: { html: '<section class="grid"><p id="x">one two three</p></section>' } },
  ];
  assert.equal(countWords(readableText({ blocks })), 3);
});

/* ── what must not count ──────────────────────────────────── */

test("a photograph contributes no words, whatever its metadata says", () => {
  const blocks = [
    para("one two three"),
    {
      type: "image",
      data: {
        public_id: "hilman/journal/warung-side-a-2026-evening-light",
        src: "https://res.cloudinary.com/x/image/upload/f_auto/a/b/c.jpg",
        alt: "a very long alternative description that is not read aloud to anyone",
        caption: "",
      },
    },
  ];
  assert.equal(countWords(readableText({ blocks })), 3);
});

test("a gallery contributes no words, however many items it holds", () => {
  const blocks = [
    para("one two three"),
    {
      type: "gallery",
      data: {
        layout: "grid",
        items: Array.from({ length: 6 }, (_, i) => ({
          public_id: `hilman/gallery/photo-number-${i}`,
          alt: `alt text for photo ${i}`,
          caption: `caption for photo ${i}`,
        })),
      },
    },
  ];
  assert.equal(countWords(readableText({ blocks })), 3);
});

test("a code listing is not read at reading speed", () => {
  const blocks = [
    para("one two three"),
    { type: "code", data: { language: "ts", code: "const a = 1;\nconst b = 2;\nreturn a + b;" } },
  ];
  assert.equal(countWords(readableText({ blocks })), 3);
});

test("a URL is one address, not a paragraph of words", () => {
  const bare = readableText({ blocks: [para("see https://example.com/a/very/long/path?x=1&y=2 now")] });
  assert.equal(countWords(bare), 2, "`see` and `now`");

  const linked = readableText({
    blocks: [{ type: "markdown", data: { md: "see [the notes](https://example.com/a/b/c) now" } }],
  });
  assert.equal(countWords(linked), 4, "the label is read, the address is not");
});

test("markdown markup is not words", () => {
  const md = "## A heading\n\n**bold** and *italic* and `code`\n\n- one\n- two\n\n![alt](https://x/y.jpg)";
  assert.equal(countWords(readableText({ blocks: [{ type: "markdown", data: { md } }] })), 9);
});

test("a fenced code block inside markdown is skipped whole", () => {
  const md = "one two\n\n```ts\nconst x = 1;\nconst y = 2;\n```\n\nthree";
  assert.equal(countWords(readableText({ blocks: [{ type: "markdown", data: { md } }] })), 3);
});

test("other block types contribute nothing", () => {
  const blocks = [
    para("one two three"),
    { type: "youtube", data: { youtube_id: "abc", caption: "" } },
    { type: "embed", data: { url: "https://example.com/embed", provider: "figma" } },
    { type: "divider", data: { style: "line" } },
    { type: "file", data: { public_id: "docs/thing", filename: "a-long-file-name.pdf" } },
    { type: "button", data: { label: "Go", href: "https://example.com", variant: "pen" } },
    { type: "link", data: { url: "https://example.com", title: "A link", description: "Some text" } },
  ];
  assert.equal(countWords(readableText({ blocks })), 3);
});

/* ── unanswered prompts are not content ───────────────────── */

test("starter prompts do not inflate the reading time", () => {
  const workingNote = BLOCK_TEMPLATES.find((t) => t.id === "journal-note")!
    .build()
    .map((b) => ({ type: b.type, data: b.data ?? {} }));

  // The headings are kept — they are real content the reader sees.
  const headingWords = countWords(
    workingNote
      .filter((b) => b.type === "heading")
      .map((b) => String(b.data.text ?? ""))
      .join(" ")
  );
  assert.equal(countWords(readableText({ blocks: workingNote })), headingWords);
});

test("once a prompt is written over, its words do count", () => {
  const blocks = [{ type: "paragraph", data: { text: "one two three four five", starter: false } }];
  assert.equal(countWords(readableText({ blocks })), 5);
});

/* ── determinism ──────────────────────────────────────────── */

test("the same document always gives the same number", () => {
  const blocks = [para(words(350)), { type: "markdown", data: { md: words(100) } }];
  const first = readTimeMinutes({ excerpt: "a deck", blocks });
  assert.equal(readTimeMinutes({ excerpt: "a deck", blocks }), first);
  assert.equal(first, 3);
});
