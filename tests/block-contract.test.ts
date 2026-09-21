import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOCK_LIMITS,
  firstBlockProblem,
  validateBlocks,
  type BlockIssue,
} from "../lib/block-contract";
import { BLOCK_TEMPLATES } from "../lib/block-templates";
import { parseStudioJson } from "../lib/studio-import";
import { describeMalformedMutation } from "../lib/studio-sync-contract";
import { resolveGalleryLayout, resolveImageLayout } from "../lib/media-layouts";
import { BLOCK_HINTS } from "../lib/types";

/**
 * What a block has to be before it is allowed to become content.
 *
 * ── the crash this file exists to prevent ──
 *
 * A block's `data` is `Record<string, any>`. TypeScript says nothing about
 * JSON, and nothing about a row that came back from PostgreSQL, so the only
 * thing standing between a pasted document and the renderer was a check that
 * `type` is a known name and `data` is an object.
 *
 * This gets through both the importer and /api/studio/sync:
 *
 *     { "type": "heading", "data": { "text": { "bad": "shape" } } }
 *
 * and then React says "Objects are not valid as a React child" — from a
 * server component, with no error boundary above it, which means the whole
 * article 500s. Not the block: the page.
 *
 * ── what is checked, and what deliberately is not ──
 *
 * Only what the renderer actually reads, and only its *type*. Emptiness is
 * not a problem here: every starter template ships blocks with `url: ""` and
 * `youtube_id: ""` on purpose, because they are scaffolding for the author to
 * fill in. Refusing those would mean you could not start a project from a
 * template. Whether a document is finished enough to publish is a different
 * question, asked in lib/content-quality.ts.
 */

const ok = (type: string, data: Record<string, unknown>) => ({ type, data });

/* ══ 1. one valid fixture per block family ═════════════════ */

const VALID: Record<string, Record<string, unknown>> = {
  heading: { level: 2, text: "A real heading" },
  paragraph: { text: "A sentence with *emphasis* in it." },
  markdown: { md: "# Title\n\nBody." },
  image: { public_id: "hilman/photo", alt: "A photograph", caption: "Taken in June" },
  gallery: { items: [{ public_id: "hilman/one", alt: "One" }, { src: "https://x.test/two.jpg" }], layout: "grid" },
  youtube: { youtube_id: "dQw4w9WgXcQ", caption: "The finished piece" },
  "loop-clip": { src: "https://clips.test/one.mp4", fit: "cover", layout: "default" },
  embed: { url: "https://www.figma.com/file/abc", height: 480 },
  quote: { text: "Something worth keeping", source: "Someone" },
  divider: { style: "line" },
  code: { language: "ts", code: "const a = 1;" },
  button: { label: "See it", href: "/works/thing", variant: "pen" },
  link: { url: "https://example.test/x", title: "A destination", presentation: "related" },
  file: { public_id: "hilman/paper", filename: "paper.pdf", size: 12345 },
  html: { html: "<p>Pasted markup</p>" },
  custom: { component: "Thing", props: {} },
};

test("every block type in the vocabulary has a valid fixture here", () => {
  // If a block type is added and this fails, the contract has a gap rather
  // than a passing test that covers nothing.
  assert.deepEqual(Object.keys(VALID).sort(), Object.keys(BLOCK_HINTS).sort());
});

test("a well-formed block of every type is accepted", () => {
  for (const [type, data] of Object.entries(VALID)) {
    const issues = validateBlocks([ok(type, data)]);
    assert.deepEqual(issues, [], `${type}: ${issues.map((i) => i.message).join(" ")}`);
  }
});

test("optional fields may simply be absent", () => {
  for (const [type, data] of Object.entries(VALID)) {
    // Only the field the renderer cannot do without is kept.
    const minimal: Record<string, Record<string, unknown>> = {
      heading: { text: "Just text" },
      paragraph: { text: "Just text" },
      markdown: { md: "text" },
      image: { public_id: "hilman/photo" },
      gallery: { items: [] },
      youtube: { youtube_id: "abc" },
      "loop-clip": { src: "https://clips.test/one.mp4" },
      embed: { url: "https://x.test" },
      quote: { text: "Words" },
      divider: {},
      code: { code: "x" },
      button: { label: "Go", href: "/x" },
      link: { url: "/works/x" },
      file: { public_id: "hilman/paper" },
      html: { html: "<p>x</p>" },
      custom: { component: "Thing" },
    };
    void data;
    assert.deepEqual(validateBlocks([ok(type, minimal[type])]), [], type);
  }
});

/* ══ 2. the scaffolding real templates produce ═════════════ */

test("every starter template passes the contract", () => {
  // These ship with `url: ""`, `youtube_id: ""` and empty galleries on
  // purpose — they are prompts for the author. A contract that rejected them
  // would mean you could not start a project from a template.
  assert.ok(BLOCK_TEMPLATES.length > 0, "there are templates to check");
  for (const template of BLOCK_TEMPLATES) {
    const issues = validateBlocks(template.build());
    assert.deepEqual(
      issues,
      [],
      `${template.id}: ${issues.map((i) => i.message).join(" ")}`
    );
  }
});

test("an empty string is a shape, not a problem", () => {
  for (const [type, data] of Object.entries({
    youtube: { youtube_id: "" },
    link: { url: "" },
    image: { public_id: "" },
    heading: { text: "" },
    code: { code: "" },
  })) {
    assert.deepEqual(validateBlocks([ok(type, data)]), [], type);
  }
});

/* ══ 3. the audited crash, and its relatives ═══════════════ */

const only = (issues: BlockIssue[]) => {
  assert.equal(issues.length > 0, true, "expected a problem and found none");
  return issues[0];
};

test("a heading whose text is an object is refused", () => {
  const issue = only(validateBlocks([ok("heading", { level: 2, text: { bad: "shape" } })]));
  assert.equal(issue.type, "heading");
  assert.equal(issue.field, "text");
  assert.match(issue.message, /Block 1 \(heading\)/);
  assert.match(issue.message, /"text" must be a string/);
});

test("the error names the block that is wrong, not just the document", () => {
  const issues = validateBlocks([
    ok("paragraph", { text: "fine" }),
    ok("paragraph", { text: "also fine" }),
    ok("heading", { text: ["nope"] }),
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /^Block 3 \(heading\)/, "counted the way a person counts");
  assert.equal(issues[0].index, 2, "and zero-based for code");
});

test("every field the renderer prints must be a string", () => {
  for (const [type, data, field] of [
    ["paragraph", { text: { bad: 1 } }, "text"],
    ["markdown", { md: [] }, "md"],
    ["quote", { text: { bad: 1 } }, "text"],
    ["quote", { text: "ok", source: 7 }, "source"],
    ["code", { code: { bad: 1 } }, "code"],
    ["code", { code: "ok", language: {} }, "language"],
    ["button", { label: {}, href: "/x" }, "label"],
    ["file", { public_id: "x", filename: [] }, "filename"],
    ["html", { html: {} }, "html"],
    ["youtube", { youtube_id: { id: "x" } }, "youtube_id"],
    ["loop-clip", { src: {} }, "src"],
    ["image", { public_id: {} }, "public_id"],
  ] as const) {
    const issue = only(validateBlocks([ok(type, data as Record<string, unknown>)]));
    assert.equal(issue.field, field, `${type}.${field}`);
  }
});

test("a heading level outside the supported set is refused", () => {
  for (const level of [1, 5, "2", {}]) {
    const issue = only(validateBlocks([ok("heading", { text: "x", level })]));
    assert.equal(issue.field, "level");
    assert.match(issue.message, /2, 3 or 4/);
  }
  // The three that exist are fine, and so is declining to choose: the
  // renderer's own default is h2 and an absent level means exactly that.
  for (const level of [2, 3, 4, undefined, null]) {
    assert.deepEqual(validateBlocks([ok("heading", { text: "x", level })]), [], String(level));
  }
});

test("a gallery item that is not a picture is refused", () => {
  const issue = only(
    validateBlocks([ok("gallery", { items: [{ public_id: "fine" }, { public_id: { bad: 1 } }] })])
  );
  assert.equal(issue.type, "gallery");
  assert.match(issue.message, /item 2/i, "says which item");
});

test("a gallery whose items are not a list is refused", () => {
  const issue = only(validateBlocks([ok("gallery", { items: "hilman/one" })]));
  assert.equal(issue.field, "items");
});

test("an unrecognised presentation is NOT a reason to refuse a document", () => {
  // Deliberate, and the opposite of what a stricter reading would do. Every
  // one of these resolves to a documented default — resolveImageLayout() and
  // friends exist to say so — which means an unknown value renders correctly
  // rather than throwing. Refusing somebody's writing over a presentation hint
  // that costs the page nothing is a decision this repository already made and
  // tested: see "a document whose layout is nonsense still imports".
  for (const [type, data] of [
    ["gallery", { items: [], layout: "mosaic" }],
    ["image", { public_id: "x", layout: "hologram" }],
    ["youtube", { youtube_id: "x", layout: "imax" }],
    ["loop-clip", { src: "https://x.test/a.mp4", layout: "cinema", fit: "stretch" }],
    ["link", { url: "/x", presentation: "billboard" }],
    ["button", { label: "x", href: "/x", variant: "danger" }],
    ["divider", { style: "zigzag" }],
    ["paragraph", { text: "x", span: "enormous", spacing: "colossal" }],
  ] as const) {
    assert.deepEqual(
      validateBlocks([ok(type, data as Record<string, unknown>)]),
      [],
      `${type} should have been accepted`
    );
  }
});

test("and an unrecognised presentation still renders as its default", () => {
  // The other half of that bargain: accepting it is only safe because the
  // renderer genuinely copes. Proven against the real components in
  // tests/block-rendering.test.ts; asserted here at the resolver.
  assert.equal(resolveImageLayout({ layout: "hologram" }), "default");
  assert.equal(resolveGalleryLayout({ layout: "mosaic" }), "grid");
});

test("the legacy gallery layout is still allowed", () => {
  // "columns" is the old two-up value and is still in the database.
  assert.deepEqual(validateBlocks([ok("gallery", { items: [], layout: "columns" })]), []);
});

test("a heading level the site cannot render is refused", () => {
  // Checked where layout is not: a heading level has no resolve*() contract
  // saying unknown means h2, and silently demoting a requested h1 changes what
  // the document says rather than how it looks.
  for (const level of [1, 5, "2", {}]) {
    const issue = only(validateBlocks([ok("heading", { text: "x", level })]));
    assert.equal(issue.field, "level");
  }
});

test("a link to a scheme that runs code is refused", () => {
  // Reusing classifyLink() rather than a second regex — see lib/links.ts for
  // why pattern-matching this is the losing approach.
  for (const url of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html;base64,x"]) {
    const issue = only(validateBlocks([ok("link", { url })]));
    assert.equal(issue.field, "url");
    assert.match(issue.message, /safe/i);
  }
});

test("ordinary links of every legitimate shape are allowed", () => {
  for (const url of ["/works/thing", "https://example.test/x", "mailto:a@b.test", "#section", "works/thing"]) {
    assert.deepEqual(validateBlocks([ok("link", { url })]), [], url);
  }
});

test("a button href gets the same treatment as a link url", () => {
  const issue = only(validateBlocks([ok("button", { label: "Go", href: "javascript:alert(1)" })]));
  assert.equal(issue.field, "href");
});

test("a deeply nested wrong type is still caught", () => {
  const issue = only(
    validateBlocks([ok("gallery", { items: [{ public_id: "a", caption: { deep: { deeper: [1] } } }] })])
  );
  assert.equal(issue.type, "gallery");
});

/* ══ 4. the block itself, not just its data ════════════════ */

test("a block with no type is refused", () => {
  for (const bad of [{ data: {} }, { type: "", data: {} }, { type: 7, data: {} }]) {
    const issue = only(validateBlocks([bad]));
    assert.match(issue.message, /type/i);
  }
});

test("an unknown block type is refused on the way in", () => {
  const issue = only(validateBlocks([ok("carousel", {})]));
  assert.match(issue.message, /carousel/);
  assert.match(issue.message, /not a kind of block/i);
});

test("a block whose data is the wrong kind of thing is refused", () => {
  for (const data of ["text", 7, []]) {
    const issue = only(validateBlocks([{ type: "paragraph", data }]));
    assert.match(issue.message, /"data" must be an object/);
  }
});

test("a block with no data at all is treated as empty, not broken", () => {
  // The database column is nullable and old rows have used it that way, so an
  // absent payload is an empty one. A block that needs a field still says so.
  assert.deepEqual(validateBlocks([{ type: "divider" }]), []);
  assert.deepEqual(validateBlocks([{ type: "divider", data: null }]), []);

  const issue = only(validateBlocks([{ type: "paragraph", data: null }]));
  assert.equal(issue.field, "text", "it names the field it needed, not the container");
});

test("the list itself has to be a list", () => {
  assert.match(firstBlockProblem("not a list") ?? "", /list of blocks/i);
  assert.equal(firstBlockProblem([]), null, "no blocks is not a problem");
});

/* ══ 5. bounds, large enough for real work ═════════════════ */

test("the limits leave room for a real portfolio piece", () => {
  // Stated as a test so shrinking them is a deliberate act with a diff.
  assert.ok(BLOCK_LIMITS.blocksPerDocument >= 300, "a long case study has a lot of blocks");
  assert.ok(BLOCK_LIMITS.galleryItems >= 100, "a shoot can be a hundred frames");
  assert.ok(BLOCK_LIMITS.textLength >= 10_000, "a paragraph block can hold an essay");
  assert.ok(BLOCK_LIMITS.codeLength >= 100_000, "a pasted file is not abuse");
});

test("an absurd document is refused rather than stored", () => {
  const many = Array.from({ length: BLOCK_LIMITS.blocksPerDocument + 1 }, () =>
    ok("paragraph", { text: "x" })
  );
  assert.match(firstBlockProblem(many) ?? "", /too many blocks/i);
});

test("an absurd string is refused rather than stored", () => {
  const issue = only(
    validateBlocks([ok("paragraph", { text: "x".repeat(BLOCK_LIMITS.textLength + 1) })])
  );
  assert.equal(issue.field, "text");
  assert.match(issue.message, /too long/i);
});

test("an absurd gallery is refused rather than stored", () => {
  const items = Array.from({ length: BLOCK_LIMITS.galleryItems + 1 }, () => ({ public_id: "x" }));
  const issue = only(validateBlocks([ok("gallery", { items })]));
  assert.equal(issue.field, "items");
});

/* ══ 6. both doors use the same contract ═══════════════════ */

test("the Studio importer refuses a malformed block", () => {
  const doc = JSON.stringify({
    title: "An entry",
    blocks: [{ type: "heading", data: { level: 2, text: { bad: "shape" } } }],
  });
  const out = parseStudioJson(doc, "journal");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.match(out.error, /Block 1 \(heading\)/);
  assert.match(out.error, /"text" must be a string/);
});

test("the importer still accepts a document that is actually fine", () => {
  const doc = JSON.stringify({
    title: "An entry",
    blocks: [
      { type: "heading", data: { level: 2, text: "Chapter one" } },
      { type: "paragraph", data: { text: "Words." } },
    ],
  });
  const out = parseStudioJson(doc, "journal");
  assert.equal(out.ok, true);
});

test("the sync endpoint refuses a malformed block", () => {
  const refusal = describeMalformedMutation({
    mutationId: "11111111-1111-4111-8111-111111111111",
    entity: "journal",
    entityId: null,
    localId: "journal:new-1",
    baseUpdatedAt: null,
    queuedAt: "2026-09-21T00:00:00.000Z",
    attempts: 0,
    payload: {
      fields: { title: "An entry" },
      blocks: [{ id: "b", position: 0, type: "heading", data: { level: 2, text: { bad: "shape" } } }],
      tagIds: [],
    },
  });
  assert.ok(refusal, "it is refused");
  assert.match(refusal!, /Block 1 \(heading\)/);
});

test("the sync endpoint still accepts a well-formed save", () => {
  const refusal = describeMalformedMutation({
    mutationId: "11111111-1111-4111-8111-111111111111",
    entity: "journal",
    entityId: null,
    localId: "journal:new-1",
    baseUpdatedAt: null,
    queuedAt: "2026-09-21T00:00:00.000Z",
    attempts: 0,
    payload: {
      fields: { title: "An entry" },
      blocks: [{ id: "b", position: 0, type: "paragraph", data: { text: "Words." } }],
      tagIds: [],
    },
  });
  assert.equal(refusal, null);
});
