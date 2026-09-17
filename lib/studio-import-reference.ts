import {
  DEFAULT_SPACING,
  DEFAULT_SPAN,
  SPACING_VALUES,
  SPAN_VALUES,
} from "./block-layout";
import { BLOCK_HINTS, type BlockType } from "./types";

/**
 * What the importers accept, written down once.
 *
 * Every piece of documentation the import sheet shows — the Markdown mapping,
 * the HTML mapping, the block reference, the JSON example and the prompt you
 * hand to a model — is generated from this file. That is the whole point:
 * documentation that is maintained separately from the parser is documentation
 * that is wrong, and this particular documentation is read by people about to
 * paste a thousand lines into an editor.
 *
 * The mapping tables are not decoration either. Each row carries an example,
 * and tests/studio-import-reference.test.ts runs every example through the
 * real importer and checks it produces the block the row claims. A row that
 * stops being true fails the build rather than misleading someone.
 *
 * Pure data and strings. No React, no DOM.
 */

export type DocumentKind = "project" | "journal";

/* ── Markdown ─────────────────────────────────────────────── */

export interface MappingRow {
  /** What you write. Shown in the guide, and run through the parser by a test. */
  syntax: string;
  /** The block it becomes. */
  becomes: BlockType;
  /** Why, when the answer is surprising. */
  note?: string;
}

/**
 * Markdown, and what each part of it turns into.
 *
 * Ordered roughly by how often it comes up rather than alphabetically — this
 * is read top to bottom by someone deciding how to write, not looked up.
 */
export const MARKDOWN_MAPPING: MappingRow[] = [
  {
    syntax: "# Title",
    becomes: "heading",
    note: "A single leading # is taken as the document's title, not a heading inside it.",
  },
  { syntax: "## Section", becomes: "heading", note: "## ### #### become levels 2, 3 and 4." },
  { syntax: "Ordinary words.", becomes: "paragraph", note: "**bold**, *italic*, `code` and [links](https://x) all work inside." },
  { syntax: "> Something quoted", becomes: "quote" },
  { syntax: "```ts\nconst a = 1;\n```", becomes: "code", note: "The word after the fence sets the language label." },
  { syntax: "![Alt text](https://example.com/photo.jpg)", becomes: "image", note: "On its own line. The address is used as-is — nothing is copied into your library." },
  { syntax: "---", becomes: "divider" },
  { syntax: "- One\n- Two", becomes: "markdown", note: "Studio has no list block, so lists stay as Markdown. The site renders them identically." },
  { syntax: "| A | B |\n| - | - |\n| 1 | 2 |", becomes: "markdown", note: "Same for tables." },
];

/* ── HTML ─────────────────────────────────────────────────── */

export interface HtmlMappingRow {
  tag: string;
  example: string;
  becomes: BlockType;
  note?: string;
}

/**
 * HTML, in Convert mode.
 *
 * `<div>`, `<section>` and the other pure wrappers are absent because they do
 * not become anything: the converter walks through them to what is inside.
 */
export const HTML_MAPPING: HtmlMappingRow[] = [
  { tag: "<h1>", example: "<h1>Title</h1>", becomes: "heading", note: "A leading <h1> is offered as the title." },
  { tag: "<h2>–<h6>", example: "<h2>Section</h2>", becomes: "heading", note: "<h5> and <h6> are clamped to level 4." },
  { tag: "<p>", example: "<p>Words</p>", becomes: "paragraph", note: "Inline tags become inline Markdown." },
  { tag: "<figure>", example: "<figure><img src='https://x.test/a.jpg'><figcaption>Caption</figcaption></figure>", becomes: "image", note: "The figcaption becomes the caption." },
  { tag: "<img>", example: "<img src='https://x.test/a.jpg'>", becomes: "image" },
  { tag: "<blockquote>", example: "<blockquote><p>Quoted</p><cite>Someone</cite></blockquote>", becomes: "quote", note: "A <cite> or <footer> becomes the attribution." },
  { tag: "<pre>", example: "<pre><code class='language-ts'>const a = 1;</code></pre>", becomes: "code" },
  { tag: "<hr>", example: "<hr>", becomes: "divider" },
  { tag: "<ul> <ol>", example: "<ul><li>One</li></ul>", becomes: "markdown", note: "Kept as Markdown so it stays editable as writing." },
  { tag: "<table>", example: "<table><tr><td>1</td></tr></table>", becomes: "html", note: "Kept whole — converting a table loses colspan and scope." },
];

/** What conversion never keeps, whichever mode you choose. */
export const HTML_REMOVED = [
  "<script>, event handlers such as onclick, and javascript: links — always, everywhere.",
  "<style> and inline style attributes. Use class names; the site's own classes work.",
  "<iframe>, <object> and <embed>. Use the Video or Embed block, which build those from a URL.",
  "<form> and form controls.",
];

/* ── the block reference ──────────────────────────────────── */

export interface BlockReferenceRow {
  type: BlockType;
  /** The shape of `data`, from BLOCK_HINTS — the same text the editor uses. */
  hint: string;
  note?: string;
}

/**
 * Blocks an imported document may contain.
 *
 * Derived from BLOCK_HINTS so the reference cannot describe a block the editor
 * does not have, or miss one it does. `custom` is excluded for the same reason
 * the importer refuses it: it names a React component, and a pasted document
 * choosing which component to mount is not a decision an import gets to make.
 */
export function blockReference(): BlockReferenceRow[] {
  const notes: Partial<Record<BlockType, string>> = {
    image:
      "Give `public_id` a full https:// address or a Cloudinary id. A relative path will not load.",
    html: "Sanitised on the way in, on the way out, and again when it is stored.",
    embed: "A share URL. Arbitrary <iframe> markup is not accepted here.",
    markdown: "The escape hatch: anything with no block of its own belongs here.",
  };

  return (Object.keys(BLOCK_HINTS) as BlockType[])
    .filter((type) => type !== "custom")
    .map((type) => ({ type, hint: BLOCK_HINTS[type], note: notes[type] }));
}

/**
 * Keys every block understands, which are not in BLOCK_HINTS.
 *
 * They are read by lib/block-layout.ts rather than by any one block, which is
 * why they are documented separately. Generated from that module so the values
 * offered here cannot drift from the ones the renderer accepts.
 *
 * `span` was called `width` until the two meanings were separated; a document
 * written against the old shape still imports correctly, because the reader
 * still accepts a string `width` naming a span. New documents should say
 * `span`, and that is what this tells anyone — or any model — writing one.
 */
export const LAYOUT_KEYS = [
  {
    key: "span",
    values: SPAN_VALUES.join(" | "),
    note: `Defaults to ${DEFAULT_SPAN}. On an image block, "width" means pixels — use "span" for the page width.`,
  },
  {
    key: "spacing",
    values: SPACING_VALUES.join(" | "),
    note: `Defaults to ${DEFAULT_SPACING}.`,
  },
];

/* ── a document to start from ─────────────────────────────── */

/**
 * A valid Studio document, generated rather than pasted into a string.
 *
 * It demonstrates the envelope (`version`, `kind`, `title`, `blocks`) and one
 * of each of the blocks worth showing. It is deliberately importable exactly as
 * it is, so "Fill with an example" is a thing you can press and then Preview.
 */
export function jsonTemplate(kind: DocumentKind): string {
  const blocks =
    kind === "project"
      ? [
          { type: "heading", data: { level: 2, text: "Overview" } },
          { type: "paragraph", data: { text: "What this project is, in **one or two** sentences." } },
          { type: "heading", data: { level: 2, text: "Process" } },
          { type: "markdown", data: { md: "- What you tried\n- What you changed\n- What you kept" } },
          {
            type: "image",
            data: { public_id: "https://example.com/photo.jpg", alt: "", caption: "What this shows" },
          },
          { type: "quote", data: { text: "Something worth quoting.", source: "Where it came from" } },
        ]
      : [
          { type: "paragraph", data: { text: "The thought this is about." } },
          { type: "heading", data: { level: 2, text: "A turn in the argument" } },
          { type: "paragraph", data: { text: "Where it went next." } },
          { type: "divider", data: { style: "line" } },
          { type: "markdown", data: { md: "- A loose end\n- Another one" } },
        ];

  return JSON.stringify(
    {
      version: 1,
      kind,
      title: kind === "project" ? "Project title" : "What this is about",
      blocks,
    },
    null,
    2
  );
}

/* ── the prompt ───────────────────────────────────────────── */

/**
 * What to hand a model when you want a document back you can paste.
 *
 * Generated from the same reference the guide shows, so a model is told the
 * same rules the parser enforces — including the refusals. Asking for the
 * publication fields to be left out is not security (the importer drops them
 * regardless, see REFUSED_KEYS in lib/studio-import.ts); it is so the reply
 * does not contain fields whose absence you then have to verify.
 *
 * `span` versus `width` is spelled out because a model asked for a wide image
 * will reach for `width` on its own. They are separate keys now — see
 * lib/block-layout.ts — but a reply that guesses wrong is still a reply you
 * have to correct by hand.
 */
export function aiPrompt(kind: DocumentKind): string {
  const reference = blockReference()
    .map((row) => `- ${row.type}: ${row.hint}`)
    .join("\n");
  const layout = LAYOUT_KEYS.map((row) => `- ${row.key}: ${row.values}`).join("\n");

  return `Write a ${kind} document for my portfolio CMS as JSON. Return only the JSON, with no commentary and no code fence.

Shape:
{
  "version": 1,
  "kind": "${kind}",
  "title": "…",
  "blocks": [ { "type": "…", "data": { … } } ]
}

Block types and the shape of their data:
${reference}

Optional on any block:
${layout}

Rules:
- "span" is the page width. On an image block "width" and "height" are the photo's own pixel size — they are different keys and do not interact.
- Use "markdown" with an "md" string for lists and tables. There is no list or table block.
- Image addresses must be full https:// URLs. Leave a photo out rather than inventing one.
- No "id", "slug", "status", "published_at" or timestamps. I decide what gets published.
- Do not invent facts about me, my clients or my results. Where you would need a fact, write a short placeholder I can replace.`;
}
