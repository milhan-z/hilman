import sanitizeHtml from "sanitize-html";

/**
 * The one place the studio decides what pasted HTML is allowed to be.
 *
 * Everything else in the notebook is owner-authored through typed fields, and
 * `components/prose.tsx` treats Markdown as trusted on that basis. A Custom
 * HTML block breaks that assumption: its whole purpose is to accept a chunk of
 * markup from somewhere else — a template, a generated answer, a page someone
 * liked — and "the owner pasted it" is not the same claim as "the owner wrote
 * every character of it".
 *
 * So this is an allowlist, not a blocklist. Anything not named below is
 * removed rather than inspected, which is the only approach that stays correct
 * as browsers invent new ways to run code.
 *
 * It runs in Node and in the browser, deliberately, and is called in three
 * places: the editor's preview, the public renderer, and the sync endpoint as
 * the content is written down. The endpoint is the one that actually protects
 * the site — a check that only ever ran in the author's browser protects
 * nothing, because the browser is exactly what an attacker would replace.
 */

/**
 * Structure and text. No <script>, no <style>, no <iframe>, no <object>, no
 * <embed>, no <form>, no <input>.
 *
 * Videos and embeds are deliberately absent: the studio already has `youtube`
 * and `embed` blocks that build those elements from a URL under known-safe
 * conditions, and letting arbitrary iframes in through the back door would
 * undo that work.
 */
const ALLOWED_TAGS = [
  "section", "article", "div", "span", "p", "br", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "figure", "figcaption", "pre", "code", "kbd", "samp",
  "strong", "b", "em", "i", "u", "s", "small", "sub", "sup", "mark", "abbr", "time",
  "a", "img", "picture", "source",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
];

/**
 * `class` is allowed on everything, which is what makes this useful — the
 * public site's own utility classes are how a pasted section ends up looking
 * like it belongs. `style` is not: it is an execution vector in its own right
 * and a reliable way to cover the whole page with an invisible overlay.
 */
const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "title", "lang", "dir", "role", "aria-*", "data-*"],
  a: ["href", "name", "target", "rel"],
  img: ["src", "srcset", "sizes", "alt", "width", "height", "loading", "decoding"],
  source: ["src", "srcset", "sizes", "type", "media"],
  time: ["datetime"],
  th: ["scope", "colspan", "rowspan"],
  td: ["colspan", "rowspan"],
  col: ["span"],
  colgroup: ["span"],
};

/** No `javascript:`, no `data:` — the two that turn a link into a program. */
const ALLOWED_SCHEMES = ["http", "https", "mailto", "tel"];

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRIBUTES,
  allowedSchemes: ALLOWED_SCHEMES,
  allowedSchemesAppliedToAttributes: ["href", "src", "srcset"],
  // `data:` images look harmless and are a standard way to smuggle SVG, which
  // can carry script. Images come from Cloudinary or a URL.
  allowProtocolRelative: false,
  // Dropping a tag should not drop the words inside it: an unexpected <center>
  // becomes its text rather than a hole in the paragraph. The genuinely
  // dangerous containers below take their contents with them.
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  enforceHtmlBoundary: false,
  transformTags: {
    // Anything leaving the site opens in a new tab and cannot reach back
    // through window.opener.
    a: (tagName, attribs) => {
      const href = attribs.href ?? "";
      const external = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: external
          ? { ...attribs, target: "_blank", rel: "noopener noreferrer" }
          : attribs,
      };
    },
  },
};

/** Markup that is safe to put on the page. Never returns anything executable. */
export function sanitizeStudioHtml(html: string): string {
  if (!html) return "";
  return sanitizeHtml(html, OPTIONS);
}

export interface HtmlReview {
  html: string;
  /** True when sanitising actually took something out. */
  changed: boolean;
  /** Plain-language notes about what was removed, for the author. */
  removed: string[];
}

/**
 * Sanitises, and says what it took away.
 *
 * Silently stripping half of what someone pasted is its own kind of failure:
 * they would publish a section that renders as an empty box and have no idea
 * why. This reports the specific things that were dropped so the author can
 * decide whether the result is still what they wanted.
 */
export function reviewStudioHtml(html: string): HtmlReview {
  const clean = sanitizeStudioHtml(html);
  const removed: string[] = [];

  const mentions = (pattern: RegExp) => pattern.test(html);
  if (mentions(/<\s*script\b/i)) removed.push("<script> tags were removed — the studio never runs pasted code.");
  if (mentions(/<\s*style\b/i) || /\sstyle\s*=/i.test(html)) {
    removed.push("Inline styles and <style> blocks were removed. Use class names instead.");
  }
  if (mentions(/\son[a-z]+\s*=/i)) removed.push("Event handlers such as onclick were removed.");
  if (mentions(/javascript\s*:/i)) removed.push("A javascript: link was removed.");
  if (mentions(/<\s*(iframe|object|embed)\b/i)) {
    removed.push("Embedded frames were removed. Use the Video or Embed block for those.");
  }
  if (mentions(/<\s*form\b/i) || mentions(/<\s*input\b/i)) removed.push("Form controls were removed.");

  const changed = clean.replace(/\s+/g, "") !== html.replace(/\s+/g, "");
  if (changed && removed.length === 0) {
    removed.push("Some markup was tidied or removed because it is not on the allowed list.");
  }

  return { html: clean, changed, removed };
}

/** Whether there is anything left once the markup is taken away. */
export function htmlHasContent(html: string): boolean {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim().length > 0
    || /<\s*(img|hr|br)\b/i.test(html);
}
