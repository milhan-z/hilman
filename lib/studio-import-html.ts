import { parseDocument } from "htmlparser2";
import { Element, Text, type AnyNode } from "domhandler";
import render from "dom-serializer";
import { sanitizeStudioHtml } from "./studio-html";
import type { BlockType } from "./types";

/**
 * HTML to Studio blocks, where the HTML says something a block can say.
 *
 * The studio already accepts pasted markup as one Custom HTML block, and that
 * remains the right answer for a design — a section with its own grid and
 * classes survives intact and stays editable as the thing you pasted. It is
 * the wrong answer for an article. A page of headings and paragraphs kept as
 * one opaque block cannot be reordered, cannot be edited a paragraph at a
 * time, and does not get the site's own typography.
 *
 * So this converts what maps and keeps what does not. A `<table>` becomes a
 * Custom HTML block because Studio has no table block and turning one into
 * Markdown loses `colspan` and `scope`; a `<p>` becomes a paragraph. The
 * output is a mixture on purpose, and every fallback is reported — the failure
 * this module exists to avoid is content that silently changed shape.
 *
 * Isomorphic: htmlparser2 and domhandler, no jsdom, so the same conversion
 * runs in the editor, in a test, and on the server if it ever needs to.
 *
 * Nothing here decides anything about publication. See lib/studio-import.ts.
 */

export interface HtmlEntry {
  type: BlockType;
  data: Record<string, unknown>;
}

export interface HtmlConversion {
  /** A leading `<h1>`, offered as the document's title rather than a heading. */
  title: string | null;
  entries: HtmlEntry[];
  warnings: string[];
}

/** Wrappers with no meaning of their own: walk through them, not around them. */
const TRANSPARENT = new Set([
  "div",
  "section",
  "article",
  "main",
  "header",
  "footer",
  "aside",
  "body",
  "html",
  "hgroup",
  "picture",
]);

/**
 * Inline tags whose disappearance changes how the sentence reads.
 *
 * Markdown has no notation for any of them, so their words survive and their
 * emphasis does not — which is worth a warning. `<span>`, `<time>` and
 * `<abbr>` are absent on purpose: they carry no visible formatting a reader
 * would miss, and reporting every wrapper would bury the warnings that matter.
 */
const FLATTENED = new Set(["mark", "u", "sub", "sup", "small"]);

/** Elements that belong inside a paragraph, not beside one. */
const INLINE = new Set([
  "a",
  "abbr",
  "b",
  "br",
  "code",
  "em",
  "i",
  "kbd",
  "mark",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
]);

const isElement = (node: AnyNode): node is Element => node instanceof Element;
const isText = (node: AnyNode): node is Text => node instanceof Text;

/** Collapses runs of whitespace the way a browser would when laying text out. */
const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Characters that would turn pasted words into formatting.
 *
 * A paragraph block is rendered through <ProseInline />, so `*` and `_` in the
 * source text are markup. Someone writing about a file called `__init__` did
 * not ask for bold.
 */
const escapeInline = (text: string) => text.replace(/([\\`*_[\]])/g, "\\$1");

/** Everything inside a node as plain words: for headings, which take no markup. */
function plainText(node: Element): string {
  const parts: string[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const child of nodes) {
      if (isText(child)) parts.push(child.data);
      else if (isElement(child)) {
        if (child.tagName === "br") parts.push(" ");
        walk(child.children);
      }
    }
  };
  walk(node.children);
  return collapse(parts.join(""));
}

/**
 * Inline markup as inline Markdown.
 *
 * Only what Markdown has a notation for: emphasis, strikethrough, code, links
 * and images. Everything else keeps its words and loses its tag — `<mark>` has
 * no Markdown, and a paragraph that silently became a Custom HTML block
 * because one word was highlighted would be a worse trade than losing the
 * highlight. What was flattened is collected in `dropped` and reported.
 */
function inlineMarkdown(nodes: AnyNode[], dropped: Set<string>): string {
  let out = "";
  for (const node of nodes) {
    if (isText(node)) {
      out += escapeInline(node.data.replace(/\s+/g, " "));
      continue;
    }
    if (!isElement(node)) continue;

    const inner = () => inlineMarkdown(node.children, dropped);
    switch (node.tagName) {
      case "strong":
      case "b":
        out += `**${inner()}**`;
        break;
      case "em":
      case "i":
        out += `*${inner()}*`;
        break;
      case "s":
        out += `~~${inner()}~~`;
        break;
      case "code":
      case "kbd":
      case "samp":
        // Backticks, and the content is literal: escaping inside code would
        // put the backslashes on the page.
        out += `\`${collapse(plainText(node))}\``;
        break;
      case "br":
        out += " ";
        break;
      case "a": {
        const href = node.attribs.href ?? "";
        const label = inner().trim();
        if (!href) {
          out += label;
          break;
        }
        out += label ? `[${label}](${href})` : href;
        break;
      }
      case "img": {
        const alt = node.attribs.alt ?? "";
        const src = node.attribs.src ?? "";
        if (src) out += `![${escapeInline(alt)}](${src})`;
        break;
      }
      default:
        if (FLATTENED.has(node.tagName) || !INLINE.has(node.tagName)) {
          dropped.add(node.tagName);
        }
        out += inner();
    }
  }
  return out;
}

/** `class="language-ts"` / `lang-ts`, on the <pre> or the <code> inside it. */
function codeLanguage(pre: Element): string {
  const code = pre.children.find((child) => isElement(child) && child.tagName === "code");
  const classes = [pre.attribs.class ?? "", (code as Element | undefined)?.attribs.class ?? ""];
  for (const value of classes) {
    const match = /(?:language|lang)-([\w+#-]+)/i.exec(value);
    if (match) return match[1].toLowerCase();
  }
  return "text";
}

/** The literal text of a <pre>, newlines and indentation intact. */
function preformattedText(pre: Element): string {
  const parts: string[] = [];
  const walk = (nodes: AnyNode[]) => {
    for (const child of nodes) {
      if (isText(child)) parts.push(child.data);
      else if (isElement(child)) {
        if (child.tagName === "br") parts.push("\n");
        else walk(child.children);
      }
    }
  };
  walk(pre.children);
  return parts.join("").replace(/^\n+|\s+$/g, "");
}

/**
 * A list as Markdown, because there is no list block.
 *
 * Kept as Markdown rather than as HTML so it is still editable as writing:
 * `- a new point` is something you can type into the block, where `<li>` is
 * something you have to maintain.
 */
function listMarkdown(list: Element, dropped: Set<string>, depth = 0): string {
  const ordered = list.tagName === "ol";
  const start = Number.parseInt(list.attribs.start ?? "1", 10);
  const pad = "  ".repeat(depth);
  const lines: string[] = [];
  let index = Number.isFinite(start) ? start : 1;

  for (const item of list.children) {
    if (!isElement(item) || item.tagName !== "li") continue;

    const nested: Element[] = [];
    const inline: AnyNode[] = [];
    for (const child of item.children) {
      if (isElement(child) && (child.tagName === "ul" || child.tagName === "ol")) nested.push(child);
      else inline.push(child);
    }

    const marker = ordered ? `${index}.` : "-";
    lines.push(`${pad}${marker} ${collapse(inlineMarkdown(inline, dropped))}`.trimEnd());
    for (const child of nested) lines.push(listMarkdown(child, dropped, depth + 1));
    index += 1;
  }

  return lines.join("\n");
}

/** A quote's attribution: a <cite>/<footer>, or a trailing em-dash line. */
function quoteParts(node: Element, dropped: Set<string>): { text: string; source: string } {
  const body: AnyNode[] = [];
  let source = "";

  for (const child of node.children) {
    if (isElement(child) && (child.tagName === "cite" || child.tagName === "footer")) {
      source = plainText(child).replace(/^[—–-]\s*/, "");
      continue;
    }
    body.push(child);
  }

  const lines = body
    .map((child) => (isElement(child) ? plainText(child) : isText(child) ? collapse(child.data) : ""))
    .filter(Boolean);

  if (!source && lines.length > 1) {
    const last = lines[lines.length - 1];
    if (/^[—–-]\s*\S/.test(last)) {
      source = last.replace(/^[—–-]\s*/, "");
      lines.pop();
    }
  }

  // Plain text, not Markdown: <QuoteBlock /> renders `text` as words.
  const text = lines.join("\n\n") || plainText(node);
  void dropped;
  return { text, source };
}

/* ── the walk ─────────────────────────────────────────────── */

class Collector {
  readonly entries: HtmlEntry[] = [];
  readonly warnings = new Set<string>();
  /** Tags that lost their markup but kept their words. */
  readonly dropped = new Set<string>();
  /** Tags that could not be represented and were kept as markup. */
  readonly kept = new Set<string>();
  title: string | null = null;

  private pending: AnyNode[] = [];

  /** Loose inline content becomes a paragraph when a block element ends it. */
  flush() {
    if (this.pending.length === 0) return;
    const text = collapse(inlineMarkdown(this.pending, this.dropped));
    this.pending = [];
    if (text) this.entries.push({ type: "paragraph", data: { text } });
  }

  inline(node: AnyNode) {
    this.pending.push(node);
  }

  push(entry: HtmlEntry) {
    this.flush();
    this.entries.push(entry);
  }

  /** Markup with no block of its own, kept whole rather than approximated. */
  keepAsHtml(node: Element) {
    const html = sanitizeStudioHtml(render(node, { decodeEntities: true }));
    if (!html.trim()) return;
    this.kept.add(node.tagName);
    this.push({ type: "html", data: { html } });
  }
}

function walk(nodes: AnyNode[], out: Collector) {
  for (const node of nodes) {
    if (isText(node)) {
      if (node.data.trim()) out.inline(node);
      continue;
    }
    if (!isElement(node)) continue;

    const tag = node.tagName;

    if (INLINE.has(tag)) {
      out.inline(node);
      continue;
    }

    if (TRANSPARENT.has(tag)) {
      out.flush();
      walk(node.children, out);
      continue;
    }

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const text = plainText(node);
        if (!text) break;
        const depth = Number(tag[1]);

        // One leading <h1> is the page's own title, not a section inside it.
        if (depth === 1 && out.title === null && out.entries.length === 0) {
          out.flush();
          out.title = text;
          break;
        }

        if (depth > 4) {
          out.warnings.add(
            `<${tag}> became a level 4 heading — the site's headings stop at 4.`
          );
        }
        out.push({
          type: "heading",
          data: { level: Math.min(4, Math.max(2, depth)), text },
        });
        break;
      }

      case "p": {
        // A paragraph that is only a picture is a picture.
        const solitary = node.children.filter(
          (child) => !(isText(child) && !child.data.trim())
        );
        if (solitary.length === 1 && isElement(solitary[0]) && solitary[0].tagName === "img") {
          pushImage(solitary[0], out);
          break;
        }
        const text = collapse(inlineMarkdown(node.children, out.dropped));
        if (text) out.push({ type: "paragraph", data: { text } });
        break;
      }

      case "figure": {
        const image = findFirst(node, "img");
        const caption = findFirst(node, "figcaption");
        if (image) {
          pushImage(image, out, caption ? plainText(caption) : "");
          break;
        }
        out.keepAsHtml(node);
        break;
      }

      case "img":
        pushImage(node, out);
        break;

      case "blockquote": {
        const { text, source } = quoteParts(node, out.dropped);
        if (text) out.push({ type: "quote", data: { text, source } });
        break;
      }

      case "hr":
        out.push({ type: "divider", data: { style: "line" } });
        break;

      case "pre": {
        const code = preformattedText(node);
        if (code) {
          out.push({ type: "code", data: { language: codeLanguage(node), code } });
        }
        break;
      }

      case "ul":
      case "ol": {
        const md = listMarkdown(node, out.dropped);
        if (md) {
          out.push({ type: "markdown", data: { md } });
          out.warnings.add(
            "Lists were kept as Markdown, which the site renders the same way — Studio has no list block."
          );
        }
        break;
      }

      case "br":
        break;

      default:
        // table, dl, details, and anything else the allowlist let through.
        out.keepAsHtml(node);
    }
  }
  out.flush();
}

function findFirst(node: Element, tag: string): Element | null {
  for (const child of node.children) {
    if (!isElement(child)) continue;
    if (child.tagName === tag) return child;
    const nested = findFirst(child, tag);
    if (nested) return nested;
  }
  return null;
}

/**
 * An <img> as an image block.
 *
 * `width` and `height` are deliberately dropped. On an image block `data.width`
 * is read twice for two different things — as a pixel width by the renderer's
 * <Pic />, and as a layout token (`prose` | `wide` | `full`) by
 * getBlockLayoutClasses — so copying `<img width="800">` into it would set a
 * layout that does not exist and silently fall back. Aspect ratio comes from
 * the file.
 */
function pushImage(node: Element, out: Collector, caption = "") {
  const src = (node.attribs.src ?? "").trim();
  if (!src) return;

  if (!/^https?:\/\//i.test(src)) {
    out.warnings.add(
      `"${src}" is a relative address, so the site cannot load it. Re-add that photo from your library.`
    );
  } else {
    out.warnings.add(
      "Photos keep their original web address — they are not copied into your media library."
    );
  }

  out.push({
    type: "image",
    data: { public_id: src, alt: node.attribs.alt ?? "", caption },
  });
}

/* ── the entry point ──────────────────────────────────────── */

export function convertHtmlToBlocks(raw: string): HtmlConversion {
  // Sanitised first, so the walk only ever sees markup that is allowed to
  // exist — and so a <script> cannot become the text of a paragraph.
  const clean = sanitizeStudioHtml(raw);
  const document = parseDocument(clean, { decodeEntities: true });

  const out = new Collector();
  walk(document.children, out);

  if (out.dropped.size > 0) {
    out.warnings.add(
      `Some formatting has no Markdown equivalent and was flattened to text: ${[...out.dropped]
        .sort()
        .map((tag) => `<${tag}>`)
        .join(", ")}.`
    );
  }
  if (out.kept.size > 0) {
    out.warnings.add(
      `Kept as Custom HTML blocks, because Studio has no block for them: ${[...out.kept]
        .sort()
        .map((tag) => `<${tag}>`)
        .join(", ")}.`
    );
  }

  return { title: out.title, entries: out.entries, warnings: [...out.warnings] };
}
