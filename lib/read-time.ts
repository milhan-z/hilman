import sanitizeHtml from "sanitize-html";
import {
  WORDS_PER_MINUTE,
  countWords,
  readTimeLabel,
  readTimeMinutesWith,
  readableTextWith,
  type ReadTimeInput,
} from "./read-time-core";

/**
 * The reading-time helper, complete.
 *
 * The counting — what counts, what does not, and why — is in
 * lib/read-time-core.ts. This adds the one step it leaves open: turning a
 * Custom HTML block into words, with the tag stripper the whole site uses.
 *
 * The save boundary imports this, which is what fills the `reading_minutes`
 * column the public list pages read, and so do the tests. The editor imports
 * the core and loads this module only when a document has markup in it (see
 * components/admin/read-time.ts), so a phone opening an ordinary entry never
 * downloads the HTML parser to count its words. Either way it is this
 * function that reads the markup: there is no second tag stripper for the
 * browser to disagree with.
 */

export { WORDS_PER_MINUTE, countWords, readTimeLabel };

/** Markup in, words out. Never counts a tag, an attribute or a URL. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}

/** The words a reader would actually read, as one string. */
export function readableText(input: ReadTimeInput): string {
  return readableTextWith(input, htmlToText);
}

/**
 * Minutes, rounded up, never zero.
 *
 * An empty note still says "1 min read" rather than "0 min read", which would
 * read as a bug rather than as a short note.
 */
export function readTimeMinutes(input: ReadTimeInput): number {
  return readTimeMinutesWith(input, htmlToText);
}
