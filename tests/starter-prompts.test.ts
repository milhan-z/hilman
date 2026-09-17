import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTER_PROMPTS,
  clearStarterMark,
  findStarterPrompts,
  isUntouchedStarter,
  promptTextsOf,
  stripStarterPrompts,
} from "../lib/starter-prompts";
import { getJournalQualityIssues, getProjectQualityIssues } from "../lib/content-quality";
import { BLOCK_TEMPLATES } from "../lib/block-templates";

/**
 * Keeping the template's questions off the public site, and nothing else.
 *
 * This gate has failed in both directions. It let a stale hand-copied list go
 * out of date, and then — fixed by matching every string in every template
 * block — it started refusing documents that were finished, because a block's
 * data holds enumerated settings and structural headings as well as prose.
 *
 * The second failure was reported from a real phone: a Journal published as
 * text, then would not publish once photographs were added, because a gallery
 * block carries `layout: "grid"` and "grid" had become a starter prompt. The
 * first group of tests below is that bug, kept reproducible.
 */

const realProse = [
  { type: "paragraph" as const, data: { text: "I walked to the warung at six and the light was already gone." } },
  { type: "paragraph" as const, data: { text: "The owner said the price of kopi went up again." } },
];

const journal = (blocks: any[]) =>
  getJournalQualityIssues({ title: "Kopi and the long walk", excerpt: "A note from Tuesday.", blocks });

const templateIssue = (blocks: any[]) =>
  journal(blocks).find((issue) => issue.code === "template") ?? null;

/* ── the reported failure, and its neighbours ─────────────── */

test("a finished Journal publishes once photographs are added", () => {
  const withGallery = [
    ...realProse,
    {
      type: "gallery",
      data: {
        layout: "grid",
        items: [
          { public_id: "journal/a", alt: "", caption: "" },
          { public_id: "journal/b", alt: "", caption: "" },
        ],
      },
    },
  ];
  assert.equal(templateIssue(withGallery), null, "`layout: \"grid\"` is a setting, not a prompt");
});

test("a divider does not make a document unpublishable", () => {
  assert.equal(templateIssue([...realProse, { type: "divider", data: { style: "line" } }]), null);
});

test("a code block does not make a document unpublishable", () => {
  assert.equal(
    templateIssue([...realProse, { type: "code", data: { language: "ts", code: "const a = 1;" } }]),
    null
  );
});

test("keeping a template's heading is using the template, not failing to finish", () => {
  const kept = [
    { type: "heading", data: { level: 3, text: "What I noticed" } },
    ...realProse,
    { type: "heading", data: { level: 3, text: "What I'd try next" } },
    { type: "paragraph", data: { text: "Ask the owner what changed upstream." } },
  ];
  assert.equal(templateIssue(kept), null);
});

test("no enumerated setting is ever treated as a prompt", () => {
  for (const value of ["grid", "columns", "line", "dots", "scribble", "ts", "pen", "ghost"]) {
    assert.equal(
      STARTER_PROMPTS.has(value),
      false,
      `"${value}" is a setting and must not be a starter prompt`
    );
  }
});

test("no structural heading is ever treated as a prompt", () => {
  const headings = BLOCK_TEMPLATES.flatMap((template) =>
    template.build().filter((block) => block.type === "heading").map((block) => String(block.data?.text ?? ""))
  );
  assert.ok(headings.length > 0, "the templates should still have headings");
  for (const heading of headings) {
    assert.equal(STARTER_PROMPTS.has(heading), false, `"${heading}" is structure, not a prompt`);
  }
});

/* ── the safety that has to survive all of that ───────────── */

test("an untouched starter template cannot be published", () => {
  for (const template of BLOCK_TEMPLATES) {
    const blocks = template.build().map((b) => ({ type: b.type, data: b.data ?? {} }));
    const hasProse = blocks.some((b) => promptTextsOf(b).length > 0);
    if (!hasProse) continue; // Blank has nothing to leave unanswered.

    const issues =
      template.kind === "project"
        ? getProjectQualityIssues({ title: "T", excerpt: "E", blocks })
        : getJournalQualityIssues({ title: "T", excerpt: "E", blocks });
    assert.ok(
      issues.some((issue) => issue.code === "template"),
      `${template.id} is publishable with its prompts unanswered`
    );
  }
});

test("the gate says exactly which blocks, not just that there are some", () => {
  const workingNote = BLOCK_TEMPLATES.find((t) => t.id === "journal-note")!.build();
  const issue = templateIssue(workingNote.map((b) => ({ type: b.type, data: b.data ?? {} })));

  assert.ok(issue, "an untouched Working note must be held back");
  assert.equal(issue!.prompts?.length, 3);
  assert.deepEqual(
    issue!.prompts?.map((p) => p.index),
    [0, 2, 4],
    "the indices have to be the positions the editor can scroll to"
  );
  assert.deepEqual(issue!.prompts?.map((p) => p.text), [
    "What prompted this note?",
    "The observation, while it is still specific.",
    "The next experiment, so future you has a starting point.",
  ]);
  assert.ok(issue!.prompts?.every((p) => p.marked), "template blocks carry the origin marker");
  assert.match(issue!.message, /3 starter prompts/);
});

test("replacing the prose publishes, which is the whole point of the gate", () => {
  const written = BLOCK_TEMPLATES.find((t) => t.id === "journal-note")!
    .build()
    .map((b) =>
      b.type === "paragraph"
        ? { type: b.type, data: clearStarterMark(b.type, b.data ?? {}, { ...b.data, text: "Real writing." }) }
        : { type: b.type, data: b.data ?? {} }
    );
  assert.equal(templateIssue(written), null);
});

test("removing the prompt blocks publishes too", () => {
  const blocks = BLOCK_TEMPLATES.find((t) => t.id === "journal-note")!
    .build()
    .map((b) => ({ type: b.type, data: b.data ?? {} }));
  const kept = stripStarterPrompts(blocks);
  assert.ok(kept.length < blocks.length, "something should have been removed");
  assert.equal(templateIssue(kept), null);
});

test("removing keeps every block the author has written in", () => {
  const blocks = BLOCK_TEMPLATES.find((t) => t.id === "journal-note")!
    .build()
    .map((b, index) =>
      index === 2
        ? { type: b.type, data: clearStarterMark(b.type, b.data ?? {}, { ...b.data, text: "Mine now." }) }
        : { type: b.type, data: b.data ?? {} }
    );
  const kept = stripStarterPrompts(blocks);
  assert.ok(
    kept.some((b) => b.data.text === "Mine now."),
    "an edited block must never be removed as an untouched prompt"
  );
});

/* ── origin metadata ──────────────────────────────────────── */

test("editing a marked block turns the marker off", () => {
  const before = { text: "What prompted this note?", starter: true };
  const after = clearStarterMark("paragraph", before, { ...before, text: "Something real." });
  assert.equal(after.starter, false);
  assert.equal(isUntouchedStarter({ type: "paragraph", data: after }), false);
});

test("changing only a layout setting is not an edit to the words", () => {
  const before = { text: "What prompted this note?", starter: true };
  const after = clearStarterMark("paragraph", before, { ...before, span: "wide" });
  assert.equal(after.starter, true, "nudging the layout does not answer the question");
  assert.equal(isUntouchedStarter({ type: "paragraph", data: after }), true);
});

test("a block the author claimed is theirs is never held back", () => {
  // What the editor writes once the prose has been changed. Even if the words
  // are typed back to the original afterwards, the block stays the author's.
  const data = { text: "What prompted this note?", starter: false };
  assert.equal(isUntouchedStarter({ type: "paragraph", data }), false);
  assert.equal(templateIssue([{ type: "paragraph", data }]), null);
});

test("a prompt merely quoted inside a longer paragraph is not a prompt", () => {
  const data = { text: "What prompted this note? A conversation on the way home, mostly." };
  assert.equal(isUntouchedStarter({ type: "paragraph", data }), false);
  assert.equal(templateIssue([data].map(() => ({ type: "paragraph", data }))), null);
});

test("findStarterPrompts reports nothing for a document that has none", () => {
  assert.deepEqual(findStarterPrompts(realProse), []);
  assert.deepEqual(findStarterPrompts([]), []);
  assert.deepEqual(findStarterPrompts(undefined), []);
});

test("a gallery caption left as the template's question is still caught", () => {
  const blocks = [
    {
      type: "gallery",
      data: {
        layout: "grid",
        items: [{ public_id: "x", alt: "", caption: "What decision does this image show?" }],
      },
    },
  ];
  const issue = templateIssue(blocks);
  assert.ok(issue, "prompts one level down still count");
  assert.equal(issue!.prompts?.[0].text, "What decision does this image show?");
});
