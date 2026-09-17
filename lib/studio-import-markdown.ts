import { marked, type Token } from "marked";
import { countByType, toBlocks, type ImportOutcome } from "./studio-import";
import type { BlockType } from "./types";

/**
 * Markdown to Studio blocks.
 *
 * Uses `marked`'s lexer rather than its renderer. Rendering Markdown to HTML
 * and then scraping that HTML back into blocks would mean parsing twice, and
 * the second parse is the one that loses things — a heading and a bold line
 * look identical once they are both `<p><strong>`. The token stream already
 * says which is which.
 *
 * The mapping is deliberately conservative. Anything without an obvious home
 * becomes a Markdown block, which the site already renders, rather than being
 * approximated into the wrong shape or dropped. Every one of those is reported
 * as a warning, because content that silently changed form is worse than
 * content that says it did.
 */

type Entry = { type: BlockType; data: Record<string, unknown> };

/** `marked` keeps the source text on every token; that is what blocks store. */
function rawOf(token: Token): string {
  return "raw" in token && typeof token.raw === "string" ? token.raw : "";
}

export function parseMarkdownDocument(raw: string): ImportOutcome {
  const text = raw.trim();
  if (!text) return { ok: false, error: "There was nothing to import." };

  let tokens: Token[];
  try {
    tokens = marked.lexer(text);
  } catch {
    return { ok: false, error: "That Markdown could not be read." };
  }

  const entries: Entry[] = [];
  const warnings = new Set<string>();
  let title: string | null = null;

  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;

      case "heading": {
        const level = Math.min(4, Math.max(2, token.depth));
        // A single leading `#` is almost always the document's own title, not
        // a section inside it. Offered as the title instead of becoming an H2
        // above everything else.
        if (token.depth === 1 && title === null && entries.length === 0) {
          title = token.text.trim();
          break;
        }
        entries.push({ type: "heading", data: { level, text: token.text } });
        break;
      }

      case "paragraph": {
        // A paragraph that is nothing but an image is an image.
        const only = token.tokens?.length === 1 ? token.tokens[0] : null;
        if (only && only.type === "image") {
          entries.push({
            type: "image",
            data: { public_id: only.href, alt: only.text ?? "", caption: only.title ?? "" },
          });
          warnings.add("Images keep their original web address — they are not copied into your library.");
          break;
        }
        entries.push({ type: "paragraph", data: { text: token.text } });
        break;
      }

      case "blockquote":
        entries.push({ type: "quote", data: { text: token.text.trim(), source: "" } });
        break;

      case "hr":
        entries.push({ type: "divider", data: { style: "line" } });
        break;

      case "code":
        entries.push({
          type: "code",
          data: { language: token.lang || "text", code: token.text },
        });
        break;

      case "list":
        // Lists render correctly as Markdown and have no block of their own.
        entries.push({ type: "markdown", data: { md: rawOf(token).trim() } });
        warnings.add("Lists were kept as Markdown, which the site renders the same way.");
        break;

      case "table":
        entries.push({ type: "markdown", data: { md: rawOf(token).trim() } });
        warnings.add("Tables were kept as Markdown — Studio has no table block.");
        break;

      case "html":
        // Deliberately not turned into an HTML block here. Markdown with
        // embedded markup is usually a stray tag rather than a design, and
        // routing it through the Markdown renderer keeps one code path.
        entries.push({ type: "markdown", data: { md: rawOf(token).trim() } });
        warnings.add("Inline HTML was kept as Markdown. Paste it as HTML instead if you want a Custom HTML block.");
        break;

      default: {
        const source = rawOf(token).trim();
        if (!source) break;
        entries.push({ type: "markdown", data: { md: source } });
        warnings.add(`Some ${token.type} content was kept as Markdown.`);
      }
    }
  }

  // A lone `# Heading` is a title and no blocks, which is a real answer — the
  // preview will say so, and the editor's title is where it lands.
  if (entries.length === 0 && title === null) {
    return { ok: false, error: "No content was found in that Markdown." };
  }

  return {
    ok: true,
    summary: {
      title,
      blocks: toBlocks(entries),
      counts: countByType(entries),
      warnings: [...warnings],
      refused: [],
    },
  };
}
