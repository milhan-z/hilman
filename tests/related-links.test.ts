import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_LINK_PRESENTATION,
  LINK_PRESENTATIONS,
  classifyLink,
  linkAttrs,
  relatedArrow,
  relatedCta,
  relatedKicker,
  relatedSort,
  resolveLinkPresentation,
} from "../lib/links";
import { BLOCK_HINTS } from "../lib/types";
import { parseStudioJson, type ImportOutcome } from "../lib/studio-import";
import { aiPrompt, blockReference, jsonTemplate } from "../lib/studio-import-reference";

/**
 * Related content: one portfolio that refers to itself.
 *
 * The feature is an extension of the existing `link` block rather than a new
 * block type, so the thing most worth defending is that it stayed an
 * extension: every Link block written before this must render exactly as it
 * did, and a document that knows nothing about `presentation` must still
 * import.
 *
 * The other half is navigation. The old card opened everything in a new tab,
 * including links to this site's own pages, which quietly breaks the back
 * button and piles up tabs on a phone. classifyLink() is the single place that
 * decision is made now, and these tests are what keep it honest about hostile
 * input.
 */

/* ── internal, external, and neither ──────────────────────── */

test("a path on this site is internal and stays in the same tab", () => {
  for (const url of ["/works/hilman-studio", "/journal/a-thought", "/about", "/"]) {
    const target = classifyLink(url);
    assert.equal(target.kind, "internal", url);
    assert.equal(target.newTab, false, url);
    assert.deepEqual(linkAttrs(target), {}, `${url} must not get _blank`);
  }
});

test("an external address opens in a new tab, safely", () => {
  const target = classifyLink("https://example.com/thing");
  assert.equal(target.kind, "external");
  assert.equal(target.newTab, true);
  assert.deepEqual(linkAttrs(target), { target: "_blank", rel: "noopener noreferrer" });
});

test("a bare relative path is internal, not a hostname", () => {
  // "works/thing" is a path, not a site called works.
  const target = classifyLink("works/thing");
  assert.equal(target.kind, "internal");
  assert.equal(target.href, "/works/thing");
});

test("a fragment or query stays on the page", () => {
  assert.equal(classifyLink("#notes").kind, "internal");
  assert.equal(classifyLink("?page=2").kind, "internal");
});

test("mailto and tel are external but do not take a tab", () => {
  for (const url of ["mailto:someone@example.com", "tel:+6281234567890"]) {
    const target = classifyLink(url);
    assert.equal(target.kind, "external", url);
    assert.equal(target.newTab, false, `${url} hands over to the OS, not to a tab`);
  }
});

/* ── the unsafe ones ──────────────────────────────────────── */

test("a javascript: URL is refused, however it is dressed up", () => {
  for (const url of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)  ",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
  ]) {
    const target = classifyLink(url);
    assert.equal(target.kind, "unsafe", JSON.stringify(url));
    assert.equal(target.href, "", "an unsafe link renders no href at all");
  }
});

test("data: and other executable schemes are refused", () => {
  for (const url of ["data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd"]) {
    assert.equal(classifyLink(url).kind, "unsafe", url);
  }
});

test("a protocol-relative URL is not mistaken for a path on this site", () => {
  // `//evil.com` looks like a path and is not one.
  assert.equal(classifyLink("//evil.com/x").kind, "unsafe");
});

test("nothing at all is unsafe rather than a link to nowhere", () => {
  for (const url of ["", "   ", null, undefined, 42, {}, []]) {
    assert.equal(classifyLink(url).kind, "unsafe", JSON.stringify(url));
  }
});

/* ── presentation is additive ─────────────────────────────── */

test("a link block with no presentation renders as it always has", () => {
  assert.equal(resolveLinkPresentation({ url: "https://x.test" }), "default");
  assert.equal(DEFAULT_LINK_PRESENTATION, "default");
});

test("an unknown presentation falls back rather than breaking", () => {
  for (const presentation of ["billboard", "", 3, null, undefined, {}]) {
    assert.equal(resolveLinkPresentation({ presentation }), "default", String(presentation));
  }
});

test("related is the only presentation added, for now", () => {
  assert.deepEqual([...LINK_PRESENTATIONS], ["default", "related"]);
});

/* ── what a related card says ─────────────────────────────── */

test("the kicker names what the destination actually is", () => {
  assert.equal(relatedKicker("/works/a"), "Related work");
  assert.equal(relatedKicker("/journal/a"), "From the journal");
  assert.equal(relatedKicker("https://example.com"), "Elsewhere");
  assert.equal(relatedKicker("/about"), "Continue exploring");
});

test("the sort of thing a URL points at is read from the URL", () => {
  assert.equal(relatedSort("/works/x"), "project");
  assert.equal(relatedSort("/journal/x"), "journal");
  assert.equal(relatedSort("/about"), "page");
  assert.equal(relatedSort("https://x.test"), "external");
  // Something unsafe is not quietly treated as internal.
  assert.equal(relatedSort("javascript:alert(1)"), "external");
});

test("the call to action falls back sensibly, and never overrides the author", () => {
  assert.equal(relatedCta("/works/x"), "See the project");
  assert.equal(relatedCta("/journal/x"), "Read the story");
  assert.equal(relatedCta("https://x.test"), "Visit site");
  assert.equal(relatedCta("/about"), "Continue reading");

  // Whatever was typed wins, whitespace and all.
  assert.equal(relatedCta("/works/x", "Have a look"), "Have a look");
  assert.equal(relatedCta("/works/x", "  Have a look  "), "Have a look");
  // But an empty label is not a label.
  assert.equal(relatedCta("/works/x", "   "), "See the project");
  assert.equal(relatedCta("/works/x", 42), "See the project");
});

test("the arrow says whether you are leaving the site", () => {
  assert.equal(relatedArrow("/works/x"), "→");
  assert.equal(relatedArrow("https://x.test"), "↗");
});

/* ── the renderer, asserted on its source ─────────────────── */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const code = (path: string) =>
  source(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

test("no link hardcodes a new tab any more", () => {
  const card = code("components/blocks/link-card.tsx");
  assert.ok(
    !/target="_blank"/.test(card),
    "the decision belongs to classifyLink(), not to the markup"
  );
  assert.match(card, /linkAttrs\(target\)/, "both cards spread the computed attributes");

  const renderer = code("components/blocks/renderer.tsx");
  assert.ok(!/target="_blank"/.test(renderer), "and the renderer does not either");
});

test("an unsafe link renders nothing at all", () => {
  // Not an inert card with a dead href — nothing. A javascript: URL that
  // somehow reached the database produces no element.
  const card = code("components/blocks/link-card.tsx");
  assert.match(card, /if \(target\.kind === "unsafe"\) return null;/);
});

test("a related card survives having no thumbnail and no description", () => {
  const card = code("components/blocks/link-card.tsx");
  // Both are rendered conditionally, so neither leaves a hole or a fixed-size
  // box waiting for content that never arrives.
  assert.match(card, /\{data\.thumbnail && \(/);
  assert.match(card, /\{data\.description && \(/);
});

test("the whole card is one anchor, so there is one thing in the tab order", () => {
  const card = code("components/blocks/link-card.tsx");
  const anchors = card.match(/<a\b/g) ?? [];
  assert.equal(anchors.length, 2, "one per presentation, each wrapping its whole card");
  assert.match(card, /focus-visible:outline/, "and it shows where focus is");
});

/* ── the public render does not query anything ────────────── */

test("a related card is a pure block render, with no lookup", () => {
  // The picker copies a snapshot into the block precisely so that a page with
  // six related cards is not seven database queries.
  const card = code("components/blocks/link-card.tsx");
  for (const term of ["supabase", "createServerSupabase", "fetch(", "await "]) {
    assert.ok(!card.includes(term), `link-card.tsx must not contain ${term}`);
  }
});

/* ── Studio JSON, old and new ─────────────────────────────── */

const doc = (blocks: unknown[]) =>
  JSON.stringify({ version: 1, kind: "journal", title: "Test", blocks });

const imported = (outcome: ImportOutcome) => {
  assert.equal(outcome.ok, true, outcome.ok ? "" : outcome.error);
  return outcome.ok ? outcome.summary.blocks : (null as never);
};

test("a link block in the old shape still imports, untouched", () => {
  const blocks = imported(
    parseStudioJson(
      doc([
        {
          type: "link",
          data: {
            url: "https://example.com",
            title: "Something",
            description: "A description",
            thumbnail: "folder/asset",
          },
        },
      ]),
      "journal"
    )
  );
  assert.equal(blocks[0].data.url, "https://example.com");
  assert.equal(blocks[0].data.thumbnail, "folder/asset");
  assert.equal("presentation" in blocks[0].data, false, "and no presentation is invented");
  assert.equal(resolveLinkPresentation(blocks[0].data), "default");
});

test("a link block in the new shape imports, keeping label and presentation", () => {
  const blocks = imported(
    parseStudioJson(
      doc([
        {
          type: "link",
          data: {
            url: "/works/hilman-studio",
            title: "Hilman Studio",
            description: "The private workspace behind this portfolio.",
            label: "See the project",
            presentation: "related",
          },
        },
      ]),
      "journal"
    )
  );
  assert.equal(blocks[0].data.url, "/works/hilman-studio");
  assert.equal(blocks[0].data.label, "See the project");
  assert.equal(blocks[0].data.presentation, "related");
  assert.equal(resolveLinkPresentation(blocks[0].data), "related");
});

test("an internal path survives the import as a path, not a guess", () => {
  const blocks = imported(
    parseStudioJson(doc([{ type: "link", data: { url: "/journal/a-thought" } }]), "journal")
  );
  assert.equal(blocks[0].data.url, "/journal/a-thought");
  assert.equal(classifyLink(blocks[0].data.url).kind, "internal");
});

test("the example document demonstrates a related link that actually parses", () => {
  const template = jsonTemplate("journal");
  const blocks = imported(parseStudioJson(template, "journal"));
  const link = blocks.find((block) => block.type === "link");
  assert.ok(link, "the journal example includes one");
  assert.equal(link!.data.presentation, "related");
  assert.equal(classifyLink(link!.data.url).kind, "internal");
});

/* ── what the editor and a model are told ─────────────────── */

test("the block hint describes the extended link shape", () => {
  const hint = BLOCK_HINTS.link;
  assert.match(hint, /label\?/, "the call to action is documented");
  assert.match(hint, /presentation\?/, "and so is the presentation");
  assert.ok(hint.includes("'related'"), "by name");
  assert.match(hint, /\/works\//, "and internal paths are shown to be allowed");
});

test("the link block is still in the importer's own reference", () => {
  const row = blockReference().find((entry) => entry.type === "link");
  assert.ok(row, "link is offered to anyone writing a document");
  assert.equal(row!.hint, BLOCK_HINTS.link, "from the same single source");
});

test("the AI prompt explains internal paths, tabs, and not inventing things", () => {
  const prompt = aiPrompt("journal");
  assert.match(prompt, /\/works\/<slug>/, "it says how to address a project");
  assert.match(prompt, /\/journal\/<slug>/, "and a journal entry");
  assert.match(prompt, /same tab/, "and which tab those open in");
  assert.match(prompt, /do not invent one/i, "and not to invent a slug");
  assert.match(prompt, /Never invent a "thumbnail"/, "or a photograph");
});

/* ── the picker ───────────────────────────────────────────── */

test("the picker maps each kind to the right public path", () => {
  const actions = code("app/admin/actions.ts");
  assert.match(actions, /url: `\/works\/\$\{row\.slug\}`/, "projects live under /works");
  assert.match(actions, /url: `\/journal\/\$\{row\.slug\}`/, "journal entries under /journal");
});

test("choosing a target copies a snapshot rather than a reference", () => {
  const editor = code("components/admin/link-block-editor.tsx");
  for (const field of ["url:", "title:", "description:", "thumbnail:", "label:"]) {
    assert.ok(editor.includes(field), `the snapshot carries ${field}`);
  }
  assert.match(editor, /presentation: "related"/, "and switches to the related card");
});

test("a chosen target never overwrites wording the author already typed", () => {
  const editor = code("components/admin/link-block-editor.tsx");
  assert.match(editor, /String\(data\.title \?\? ""\)\.trim\(\) \|\| target\.title/);
  assert.match(editor, /String\(data\.description \?\? ""\)\.trim\(\) \|\| target\.description/);
});

test("draft targets are selectable, marked, and warned about", () => {
  const picker = code("components/admin/link-target-picker.tsx");
  assert.match(picker, /!row\.live/, "a draft is labelled in the list");
  assert.match(picker, /Draft/, "in those words");
  assert.match(picker, /404/, "and the consequence is spelled out");

  // And nothing about picking one publishes anything. Asserted on what the
  // module can *call* rather than on the word "publish", which legitimately
  // appears in the warning copy above ("until you publish it").
  for (const call of ["savePageData", "bulkUpdateItems", "handOffSave", "status:", '"published"']) {
    assert.ok(!picker.includes(call), `picking must not reach for ${call}`);
  }
  // getLinkTargets is a read. It is the only server action the picker imports.
  const imports = picker.match(/from "@\/app\/admin\/actions"/g) ?? [];
  assert.equal(imports.length, 1);
  assert.match(picker, /import \{ getLinkTargets/);
});

test("the picker is owner-checked, like every other Studio query", () => {
  const actions = code("app/admin/actions.ts");
  const fn = actions.slice(actions.indexOf("export async function getLinkTargets"));
  assert.match(fn.slice(0, 400), /checkOwner\(\)/, "it refuses a stranger");
});

test("link and embed remain different ideas", () => {
  // A Link is navigation; an Embed renders remote content. Conflating them is
  // how a portfolio ends up with iframes it did not mean to serve.
  assert.match(BLOCK_HINTS.embed, /iframe|share URL/i);
  assert.ok(!BLOCK_HINTS.link.includes("iframe"), "a link never embeds anything");
});
