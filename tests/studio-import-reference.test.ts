import assert from "node:assert/strict";
import test from "node:test";
import {
  HTML_MAPPING,
  MARKDOWN_MAPPING,
  aiPrompt,
  blockReference,
  jsonTemplate,
} from "../lib/studio-import-reference";
import { parseHtmlDocument, parseStudioJson, type ImportOutcome } from "../lib/studio-import";
import { parseMarkdownDocument } from "../lib/studio-import-markdown";
import { BLOCK_HINTS, type BlockType } from "../lib/types";

/**
 * Documentation that is checked rather than trusted.
 *
 * The import sheet tells the owner what Markdown becomes, what HTML becomes,
 * and what a valid Studio document looks like — and then he pastes a thousand
 * lines on the strength of it. A guide that quietly stopped being true would be
 * worse than no guide, so every example in the reference is run through the
 * real parser here and has to produce what the reference claims.
 *
 * This is also what stops the reference drifting when a block is added: the
 * rows come from BLOCK_HINTS, and the prompt and template are generated from
 * the rows.
 */

const ok = (outcome: ImportOutcome) => {
  assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  return outcome.ok ? outcome.summary : (null as never);
};

/* ── the Markdown guide is true ───────────────────────────── */

for (const row of MARKDOWN_MAPPING) {
  test(`Markdown guide: ${JSON.stringify(row.syntax)} → ${row.becomes}`, () => {
    // The `# Title` row is the one case that produces a title and no block,
    // which is exactly what the row's own note says it does.
    if (row.syntax.startsWith("# ")) {
      const alone = ok(parseMarkdownDocument(row.syntax));
      assert.equal(alone.title, "Title");
      assert.deepEqual(alone.blocks, [], "a lone title produces no blocks");

      const withBody = ok(parseMarkdownDocument(`${row.syntax}\n\nA paragraph.`));
      assert.equal(withBody.title, "Title");
      assert.deepEqual(
        withBody.blocks.map((block) => block.type),
        ["paragraph"],
        "and does not also become a heading above the body"
      );
      return;
    }

    const summary = ok(parseMarkdownDocument(row.syntax));
    assert.equal(
      summary.blocks[0].type,
      row.becomes,
      `the guide says this becomes a ${row.becomes} block`
    );
  });
}

test("the Markdown guide covers every block Markdown can produce", () => {
  const documented = new Set(MARKDOWN_MAPPING.map((row) => row.becomes));
  // Anything the parser can emit and the guide does not mention is a gap.
  for (const expected of ["heading", "paragraph", "quote", "code", "image", "divider", "markdown"]) {
    assert.ok(documented.has(expected as BlockType), `${expected} is undocumented`);
  }
});

/* ── the HTML guide is true ───────────────────────────────── */

for (const row of HTML_MAPPING) {
  test(`HTML guide: ${row.tag} → ${row.becomes}`, () => {
    const summary = ok(parseHtmlDocument(row.example, "blocks"));

    // A leading <h1> is offered as the title, so its own example has to be
    // read the way the note says it is read.
    if (row.tag === "<h1>") {
      assert.equal(summary.title, "Title");
      assert.deepEqual(summary.blocks, [], "a lone <h1> produces no blocks");
      return;
    }

    assert.equal(
      summary.blocks[0].type,
      row.becomes,
      `the guide says ${row.tag} becomes a ${row.becomes} block`
    );
  });
}

/* ── the block reference matches the editor's own schema ──── */

test("the reference lists every importable block and nothing else", () => {
  const listed = blockReference().map((row) => row.type);
  const expected = (Object.keys(BLOCK_HINTS) as BlockType[]).filter((type) => type !== "custom");
  assert.deepEqual([...listed].sort(), [...expected].sort());
});

test("the reference quotes the editor's own field hints, not a copy", () => {
  for (const row of blockReference()) {
    assert.equal(row.hint, BLOCK_HINTS[row.type]);
  }
});

test("custom blocks are never offered, because an import cannot choose a component", () => {
  assert.equal(
    blockReference().some((row) => row.type === "custom"),
    false
  );
});

/* ── the JSON template is a document you can actually import ─ */

for (const kind of ["project", "journal"] as const) {
  test(`the ${kind} JSON template imports cleanly`, () => {
    const summary = ok(parseStudioJson(jsonTemplate(kind), kind));
    assert.ok(summary.blocks.length > 0);
    assert.equal(summary.refused.length, 0, "the template must not carry publication fields");
    assert.deepEqual(summary.warnings, [], "the template must not need a warning");
  });

  test(`the ${kind} template is refused by the other kind, as the validator promises`, () => {
    const other = kind === "project" ? "journal" : "project";
    const outcome = parseStudioJson(jsonTemplate(kind), other);
    assert.equal(outcome.ok, false);
  });
}

test("the template sets no width on an image block", () => {
  for (const kind of ["project", "journal"] as const) {
    const summary = ok(parseStudioJson(jsonTemplate(kind), kind));
    for (const block of summary.blocks) {
      if (block.type === "image") assert.equal("width" in (block.data ?? {}), false);
    }
  }
});

/* ── the prompt describes the parser that exists ──────────── */

test("the prompt names every importable block", () => {
  for (const kind of ["project", "journal"] as const) {
    const prompt = aiPrompt(kind);
    for (const row of blockReference()) {
      assert.ok(prompt.includes(row.type), `${row.type} is missing from the prompt`);
    }
  }
});

test("the prompt asks for the kind it was generated for", () => {
  assert.match(aiPrompt("project"), /"kind": "project"/);
  assert.match(aiPrompt("journal"), /"kind": "journal"/);
});

test("the prompt tells the model what the importer would refuse anyway", () => {
  const prompt = aiPrompt("project");
  for (const key of ["id", "slug", "status", "published_at"]) {
    assert.ok(prompt.includes(key), `${key} should be mentioned`);
  }
});
