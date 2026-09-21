import { classifyLink } from "./links";
import { BLOCK_HINTS, type BlockType } from "./types";

/**
 * What a block has to be before it is allowed to become content.
 *
 * ── the crash this exists to prevent ──
 *
 * A block's `data` is `Record<string, any>`, which is honest: the shape really
 * does depend on `type`. But TypeScript says nothing about JSON, and nothing
 * about a row read back from PostgreSQL, so the only thing between a pasted
 * document and the renderer was a check that `type` is a known name and `data`
 * is an object.
 *
 * That lets this through both the Studio importer and /api/studio/sync:
 *
 *     { "type": "heading", "data": { "text": { "bad": "shape" } } }
 *
 * and then React says *Objects are not valid as a React child*. From a server
 * component, with no error boundary above it, that is not a broken block — it
 * is a 500 on the whole article.
 *
 * ── what is checked ──
 *
 * Only what the renderer actually reads, and only its *type*. The question
 * here is "can this be drawn without throwing", not "is this good writing".
 *
 * Presentation is deliberately *not* checked. `layout`, `presentation`, `fit`,
 * `variant`, `style`, `span` and `spacing` each resolve to a documented
 * default when they say something unrecognised — `resolveImageLayout()` and
 * friends in lib/media-layouts.ts, `resolveSpan()` in lib/block-layout.ts —
 * so an unknown value renders correctly rather than throwing. Refusing a
 * document over one would be refusing somebody's writing for a reason that
 * costs the page nothing, which is a decision this repository already made
 * deliberately and tested: see "a document whose layout is nonsense still
 * imports" in tests/media-layouts.test.ts.
 *
 * A `javascript:` URL is the exception, and not an exception to the rule: it
 * is not a presentation choice that resolves to a default, it is an attack.
 *
 * Emptiness in particular is not a problem. Every starter template ships
 * blocks with `url: ""` and `youtube_id: ""` on purpose — they are scaffolding
 * for the author to fill in — so a contract that demanded non-empty strings
 * would mean you could not start a project from a template. Whether a document
 * is finished enough to *publish* is a different question, asked separately in
 * lib/content-quality.ts.
 *
 * ── where it is enforced ──
 *
 * On the way in, in both doors: lib/studio-import.ts and the sync contract.
 * Not on the way out. A malformed row that predates this, or arrives by some
 * route nobody thought of, must not take a published page down — so the
 * renderer checks each block on its own and skips the one it cannot draw. See
 * safeBlocks() below and components/blocks/renderer.tsx.
 */

/* ── how much is too much ─────────────────────────────────── */

/**
 * Bounds that only a malformed or malicious document reaches.
 *
 * Chosen to be far above real work rather than close to it: the point is that
 * a broken import cannot produce something absurd, not to have an opinion
 * about how long an essay may be. The numbers are asserted in the tests so
 * that shrinking one is a deliberate act with a diff attached.
 */
export const BLOCK_LIMITS = {
  /** A long case study is dozens of blocks. Five hundred is not a document. */
  blocksPerDocument: 500,
  /** A paragraph block can hold an essay; 20k characters is roughly 3,000 words. */
  textLength: 20_000,
  /** A pasted source file is legitimate. */
  codeLength: 200_000,
  htmlLength: 200_000,
  /** A photo shoot can genuinely be a hundred frames. */
  galleryItems: 200,
  urlLength: 4_096,
} as const;

export interface BlockIssue {
  /** Zero-based, for code. The message counts from one, for people. */
  index: number;
  type: string;
  /** The key that is wrong, when one key is to blame. */
  field: string | null;
  /** A whole sentence: `Block 4 (heading): "text" must be a string.` */
  message: string;
}

const KNOWN_TYPES = new Set<string>(Object.keys(BLOCK_HINTS));

/* ── the checks themselves ────────────────────────────────── */

/**
 * One block's worth of complaints.
 *
 * Written as a little collector rather than a schema object because the rules
 * are not uniform — `image` accepts either of two keys for the same thing, a
 * link's URL has to be run through the site's own safety check, and a gallery
 * has to say *which* item is wrong. A generic validator would have to grow
 * escape hatches for all three.
 */
class Complaints {
  readonly issues: BlockIssue[] = [];

  constructor(
    private readonly index: number,
    private readonly type: string
  ) {}

  add(field: string | null, problem: string) {
    this.issues.push({
      index: this.index,
      type: this.type,
      field,
      message: `Block ${this.index + 1} (${this.type}): ${problem}`,
    });
  }

  /** Must be a string when present. Absent is fine unless `required`. */
  string(
    data: Record<string, unknown>,
    field: string,
    options: { required?: boolean; max?: number } = {}
  ): boolean {
    const value = data[field];
    if (value === undefined || value === null) {
      if (options.required) this.add(field, `"${field}" is missing.`);
      return false;
    }
    if (typeof value !== "string") {
      this.add(field, `"${field}" must be a string.`);
      return false;
    }
    const max = options.max ?? BLOCK_LIMITS.textLength;
    if (value.length > max) {
      this.add(field, `"${field}" is too long (${value.length} characters, limit ${max}).`);
      return false;
    }
    return true;
  }

  number(data: Record<string, unknown>, field: string) {
    const value = data[field];
    if (value === undefined || value === null) return;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.add(field, `"${field}" must be a number.`);
    }
  }

  /** A URL the site would actually follow — see classifyLink() in links.ts. */
  safeUrl(data: Record<string, unknown>, field: string, required = false) {
    if (!this.string(data, field, { required, max: BLOCK_LIMITS.urlLength })) return;
    const raw = String(data[field] ?? "");
    // Empty is scaffolding, not a link. The renderer already draws nothing.
    if (!raw.trim()) return;
    if (classifyLink(raw).kind === "unsafe") {
      this.add(field, `"${field}" is not a safe URL.`);
    }
  }

  /** Either of two keys naming the same asset; at least one must be a string. */
  eitherString(data: Record<string, unknown>, a: string, b: string) {
    const present = [a, b].filter((key) => data[key] !== undefined && data[key] !== null);
    if (present.length === 0) {
      this.add(a, `"${a}" or "${b}" is missing.`);
      return;
    }
    for (const key of present) this.string(data, key, { max: BLOCK_LIMITS.urlLength });
  }
}

/** The rules per block type: what the renderer will try to draw. */
function checkData(type: BlockType, data: Record<string, unknown>, say: Complaints) {
  switch (type) {
    case "heading":
      say.string(data, "text", { required: true });
      // `level` is checked where `layout` is not, and the difference is real:
      // the layout keys have resolve*() functions that *document* unknown ->
      // default, so rendering one is correct behaviour. A heading level has no
      // such contract — the ternary in the renderer is an implementation
      // detail — and quietly turning a requested h1 into an h2 changes what the
      // document says rather than how it looks.
      if (data.level !== undefined && data.level !== null && ![2, 3, 4].includes(data.level as number)) {
        say.add("level", `"level" must be 2, 3 or 4.`);
      }
      break;

    case "paragraph":
      say.string(data, "text", { required: true });
      break;

    case "markdown":
      say.string(data, "md", { required: true, max: BLOCK_LIMITS.htmlLength });
      break;

    case "image":
      say.eitherString(data, "public_id", "src");
      say.string(data, "alt");
      say.string(data, "caption");
      say.number(data, "width");
      say.number(data, "height");
      break;

    case "gallery": {
      const items = data.items;
      if (items === undefined || items === null) {
        say.add("items", `"items" is missing.`);
        break;
      }
      if (!Array.isArray(items)) {
        say.add("items", `"items" must be a list.`);
        break;
      }
      if (items.length > BLOCK_LIMITS.galleryItems) {
        say.add("items", `"items" has ${items.length} entries, limit ${BLOCK_LIMITS.galleryItems}.`);
        break;
      }
      items.forEach((item, at) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          say.add("items", `item ${at + 1} must be an object.`);
          return;
        }
        const entry = item as Record<string, unknown>;
        for (const key of ["public_id", "src", "alt", "caption"]) {
          const value = entry[key];
          if (value === undefined || value === null) continue;
          if (typeof value !== "string") {
            say.add("items", `item ${at + 1}: "${key}" must be a string.`);
          } else if (value.length > BLOCK_LIMITS.urlLength) {
            say.add("items", `item ${at + 1}: "${key}" is too long.`);
          }
        }
      });
      break;
    }

    case "youtube":
      say.string(data, "youtube_id", { required: true, max: BLOCK_LIMITS.urlLength });
      say.string(data, "caption");
      break;

    case "loop-clip":
      say.string(data, "src", { required: true, max: BLOCK_LIMITS.urlLength });
      say.string(data, "caption");
      break;

    case "embed":
      // Accepts a bare URL or a whole <iframe> snippet, so this is a string
      // check rather than a link check — parseEmbed() does the extracting.
      say.string(data, "url", { required: true, max: BLOCK_LIMITS.htmlLength });
      say.string(data, "provider");
      say.number(data, "height");
      break;

    case "quote":
      say.string(data, "text", { required: true });
      say.string(data, "source");
      break;

    case "divider":
      // Nothing to check: `style` resolves to a plain rule whatever it says.
      break;

    case "code":
      say.string(data, "code", { required: true, max: BLOCK_LIMITS.codeLength });
      say.string(data, "language", { max: 100 });
      break;

    case "button":
      say.string(data, "label", { required: true });
      say.safeUrl(data, "href", true);
      break;

    case "link":
      say.safeUrl(data, "url", true);
      say.string(data, "title");
      say.string(data, "description");
      say.string(data, "thumbnail", { max: BLOCK_LIMITS.urlLength });
      say.string(data, "label");
      break;

    case "file":
      say.eitherString(data, "public_id", "src");
      say.string(data, "filename");
      say.number(data, "size");
      break;

    case "html":
      say.string(data, "html", { required: true, max: BLOCK_LIMITS.htmlLength });
      break;

    case "custom":
      say.string(data, "component", { required: true, max: 200 });
      if (data.props !== undefined && data.props !== null) {
        if (typeof data.props !== "object" || Array.isArray(data.props)) {
          say.add("props", `"props" must be an object.`);
        }
      }
      break;
  }

}

/**
 * Everything wrong with one block, in document order.
 *
 * `id` and `position` are deliberately not required: the importer builds
 * blocks without them and assigns them afterwards, so this validates the part
 * that carries meaning.
 */
export function validateBlock(candidate: unknown, index: number): BlockIssue[] {
  const type =
    candidate && typeof candidate === "object"
      ? (candidate as { type?: unknown }).type
      : undefined;

  const named = typeof type === "string" && type ? type : "?";
  const say = new Complaints(index, named);

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    say.add(null, "a block must be an object.");
    return say.issues;
  }
  if (typeof type !== "string" || !type.trim()) {
    say.add("type", `"type" is missing.`);
    return say.issues;
  }
  if (!KNOWN_TYPES.has(type)) {
    say.add("type", `"${type}" is not a kind of block this site renders.`);
    return say.issues;
  }

  const raw = (candidate as { data?: unknown }).data;
  // The column is nullable and old rows have used it that way, so an absent
  // payload is an empty one rather than a fault.
  const data = raw === undefined || raw === null ? {} : raw;
  if (typeof data !== "object" || Array.isArray(data)) {
    say.add("data", `"data" must be an object.`);
    return say.issues;
  }

  checkData(type as BlockType, data as Record<string, unknown>, say);
  return say.issues;
}

/** Everything wrong with a document's blocks. Empty means safe to store. */
export function validateBlocks(blocks: unknown): BlockIssue[] {
  if (!Array.isArray(blocks)) {
    return [
      { index: 0, type: "?", field: null, message: "The content must be a list of blocks." },
    ];
  }
  if (blocks.length > BLOCK_LIMITS.blocksPerDocument) {
    return [
      {
        index: 0,
        type: "?",
        field: null,
        message: `That document has too many blocks (${blocks.length}, limit ${BLOCK_LIMITS.blocksPerDocument}).`,
      },
    ];
  }
  return blocks.flatMap((block, index) => validateBlock(block, index));
}

/** The first thing wrong, as a sentence, or null when there is nothing. */
export function firstBlockProblem(blocks: unknown): string | null {
  return validateBlocks(blocks)[0]?.message ?? null;
}

/**
 * The blocks a page can safely draw, for the read path.
 *
 * Deliberately the opposite posture from the write path. New content is
 * refused precisely, with the block and the field named, so the author can fix
 * it. Content that is *already stored* is filtered: a row written before this
 * contract existed, or by some route nobody anticipated, loses its own block
 * and nothing else. One bad block must never be able to take down an article
 * that is otherwise perfectly readable.
 */
export function safeBlocks<T>(blocks: T[]): T[] {
  return blocks.filter((block, index) => validateBlock(block, index).length === 0);
}
