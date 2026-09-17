import assert from "node:assert/strict";
import test from "node:test";
import { BLOCK_TEMPLATES, templatesFor } from "../lib/block-templates";
import { getJournalQualityIssues, getProjectQualityIssues } from "../lib/content-quality";
import { toBlocks } from "../lib/studio-import";
import { BLOCK_HINTS, type BlockType } from "../lib/types";

/**
 * What a starter template is allowed to be.
 *
 * Two surfaces offer these — an empty document and the import sheet — and both
 * turn them into ordinary blocks, so a template that produced a block type the
 * editor does not have would break in the editor rather than here.
 *
 * The property worth defending hardest is the last one. A template's whole
 * content is instructions to the author, and the publication gate refuses to
 * put unchanged instructions on the public site. That gate reads this registry,
 * so the test that matters is that every template is still caught by it — an
 * uncaught template is a route to publishing "What was the situation?" as if it
 * were writing.
 */

const KINDS = ["project", "journal"] as const;

test("every template builds blocks the editor knows", () => {
  const known = new Set(Object.keys(BLOCK_HINTS) as BlockType[]);
  for (const template of BLOCK_TEMPLATES) {
    for (const block of template.build()) {
      assert.ok(known.has(block.type), `${template.id} builds an unknown "${block.type}"`);
      assert.notEqual(block.type, "custom", `${template.id} must not mount a component`);
    }
  }
});

test("template ids are unique, because they are how one is chosen", () => {
  const ids = BLOCK_TEMPLATES.map((template) => template.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("a template brings no ids and no positions of its own", () => {
  for (const template of BLOCK_TEMPLATES) {
    for (const block of template.build()) {
      assert.equal("id" in block, false, `${template.id} supplies a block id`);
      assert.equal("position" in block, false, `${template.id} supplies a position`);
    }
  }
});

test("building twice gives independent data, so editing one copy cannot change the next", () => {
  for (const template of BLOCK_TEMPLATES) {
    const first = template.build();
    const second = template.build();
    for (let i = 0; i < first.length; i += 1) {
      assert.notEqual(first[i].data, second[i].data, `${template.id} shares a data object`);
    }
  }
});

test("each kind offers a blank, and leads with it", () => {
  for (const kind of KINDS) {
    const list = templatesFor(kind);
    assert.ok(list.length > 1, `${kind} should offer more than just one thing`);
    assert.equal(list[0].emphasis, "primary", `${kind} does not lead with its recommended choice`);
    assert.equal(
      list.filter((template) => template.emphasis === "primary").length,
      1,
      `${kind} recommends more than one template`
    );
  }
});

test("blank really is blank: one empty paragraph to type into", () => {
  for (const kind of KINDS) {
    const blank = templatesFor(kind)[0].build();
    assert.equal(blank.length, 1);
    assert.equal(blank[0].type, "paragraph");
    assert.equal(blank[0].data?.text, "");
  }
});

test("templates only ever appear for their own kind", () => {
  for (const kind of KINDS) {
    for (const template of templatesFor(kind)) assert.equal(template.kind, kind);
  }
});

test("an imported template becomes ordinary blocks with fresh ids", () => {
  const built = toBlocks(
    BLOCK_TEMPLATES[0].build().map((block) => ({ type: block.type, data: block.data ?? {} }))
  );
  assert.deepEqual(
    built.map((block) => block.position),
    built.map((_, index) => index)
  );
  assert.equal(new Set(built.map((block) => block.id)).size, built.length);
});

/**
 * The gate derives its prompt list from this registry. If that derivation ever
 * breaks, this is where it shows up — every template with writing in it must be
 * unpublishable until the writing is replaced.
 */
test("no template can be published with its prompts still in it", () => {
  for (const template of BLOCK_TEMPLATES) {
    const blocks = template.build().map((block) => ({ type: block.type, data: block.data ?? {} }));
    const hasProse = blocks.some((block) =>
      Object.values(block.data).some((value) => typeof value === "string" && value.trim())
    );
    if (!hasProse) continue; // Blank has nothing to leave unedited.

    const issues =
      template.kind === "project"
        ? getProjectQualityIssues({ title: "A title", excerpt: "An excerpt", blocks })
        : getJournalQualityIssues({ title: "A title", excerpt: "An excerpt", blocks });

    assert.ok(
      issues.some((issue) => issue.code === "template"),
      `${template.id} is publishable with its starter prompts unchanged`
    );
  }
});

test("replacing the prompts makes a template publishable", () => {
  const template = BLOCK_TEMPLATES.find((entry) => entry.id === "journal-reflection")!;
  const rewritten = template.build().map((block) => ({
    type: block.type,
    data: Object.fromEntries(
      Object.entries(block.data ?? {}).map(([key, value]) => [
        key,
        typeof value === "string" && value.trim() ? "Words I actually wrote myself." : value,
      ])
    ),
  }));
  const issues = getJournalQualityIssues({
    title: "A real note",
    excerpt: "Something I mean",
    blocks: rewritten,
  });
  assert.equal(
    issues.some((issue) => issue.code === "template"),
    false
  );
});
