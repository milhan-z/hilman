import sanitizeHtml from "sanitize-html";
import { isUntouchedStarter } from "./starter-prompts";

/**
 * How long this takes to read, worked out rather than typed in.
 *
 * "3 min read" was a text field in the metadata panel, which made it a claim
 * the author had to maintain by hand and therefore a number that was wrong
 * within one edit. It is derived data: the words are already there, and
 * counting them is not a judgement anyone needs to make.
 *
 * ── what counts ──
 *
 * The prose a reader actually reads on the page: the excerpt, which the
 * article renders as a deck under the title, and the text of the blocks that
 * are words. A gallery is not words. Neither is a Cloudinary id, a URL, an alt
 * attribute, a JSON payload or the tags inside a Custom HTML block — all of
 * which are strings, and all of which would inflate the count if this walked
 * block data the way a naive implementation would.
 *
 * Code blocks are left out too. A listing is not read at reading speed, and
 * counting `const a = 1;` as three words makes the estimate worse, not better.
 *
 * Unanswered starter prompts are left out as well. They are not going to be on
 * the page — either the author replaces them or the quality gate stops the
 * document — so counting them would advertise a length the reader never gets.
 *
 * ── one helper ──
 *
 * Everything that shows a reading time calls this: the editor as you type, and
 * the save boundary that fills the database column the public list pages read.
 * Two implementations would disagree the first time one of them was improved.
 */

/**
 * 200, because that is the number this codebase already used.
 *
 * lib/utils.ts carried `readingMinutes(text)` at 200 wpm since the beginning.
 * Nothing ever called it, but it was the site's stated convention, and changing
 * the number would silently reprice every existing article. That function has
 * been deleted: two implementations of one derived value is how they come to
 * disagree.
 */
export const WORDS_PER_MINUTE = 200;

/** Block types whose text a reader reads. Everything else contributes nothing. */
const PROSE_FIELDS: Record<string, readonly string[]> = {
  paragraph: ["text"],
  heading: ["text"],
  quote: ["text", "source"],
  markdown: ["md"],
  html: ["html"],
};

/**
 * Anything with a type and a payload.
 *
 * Deliberately wider than `Block`: this counts words in whatever it is handed,
 * and an unrecognised type simply has no prose fields and contributes nothing.
 * Insisting on the exact union would make callers cast rather than make the
 * function safer.
 */
interface Blockish {
  type: string;
  data?: Record<string, any> | null;
}

/** Markup in, words out. Never counts a tag, an attribute or a URL. */
function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}

/**
 * Markdown in, words out.
 *
 * Fenced code goes first, whole — it is a listing, not prose. Then images,
 * which are a URL and an alt text and no reading at all. Then link syntax,
 * keeping the label and dropping the address, because "https://example.com/a/b"
 * is one long token that would otherwise count as a word. What is left is
 * inline punctuation, which is stripped so `**bold**` counts once.
 */
function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^\s{0,3}>\s?/gm, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, " ")
    .replace(/^\s{0,3}[-*+]\s+/gm, " ")
    .replace(/^\s{0,3}\d+\.\s+/gm, " ")
    .replace(/[`*_~|]/g, " ")
    .replace(/^\s*[-=]{3,}\s*$/gm, " ");
}

/** Bare URLs are one token each, and reading one is not reading a word. */
const stripUrls = (text: string) => text.replace(/\bhttps?:\/\/\S+/gi, " ");

/** The words a reader would actually read, as one string. */
export function readableText(input: {
  excerpt?: string | null;
  blocks?: readonly Blockish[];
}): string {
  const parts: string[] = [];

  // The article renders the excerpt as a deck under the title, so it is read.
  if (input.excerpt?.trim()) parts.push(input.excerpt.trim());

  for (const block of input.blocks ?? []) {
    // A prompt nobody has answered is not going to be on the page.
    if (isUntouchedStarter(block)) continue;

    for (const field of PROSE_FIELDS[block.type] ?? []) {
      const value = block.data?.[field];
      if (typeof value !== "string" || !value.trim()) continue;

      if (block.type === "html") parts.push(htmlToText(value));
      else if (block.type === "markdown") parts.push(markdownToText(value));
      else parts.push(value);
    }
  }

  return stripUrls(parts.join("\n\n"));
}

/** Words, counted the way a person would: runs of non-space. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

/**
 * Minutes, rounded up, never zero.
 *
 * An empty note still says "1 min read" rather than "0 min read", which would
 * read as a bug rather than as a short note.
 */
export function readTimeMinutes(input: {
  excerpt?: string | null;
  blocks?: readonly Blockish[];
}): number {
  return Math.max(1, Math.ceil(countWords(readableText(input)) / WORDS_PER_MINUTE));
}

/** "4 min read", for the one place that needs the phrase rather than the number. */
export const readTimeLabel = (minutes: number) => `${minutes} min read`;
