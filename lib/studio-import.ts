import { sanitizeStudioHtml } from "./studio-html";
import { convertHtmlToBlocks } from "./studio-import-html";
import { firstBlockProblem } from "./block-contract";
import { BLOCK_HINTS, type Block, type BlockType } from "./types";

/**
 * Bringing a document in from somewhere else.
 *
 * The rule the whole module is built around: **an import is an edit, not a
 * publication.** Whatever arrives here becomes ordinary blocks in the editor's
 * local state, indistinguishable from blocks that were typed, and it reaches
 * the public site by exactly the same route everything else does — someone
 * pressing Publish or Update live. Nothing in this file talks to the network,
 * and nothing it produces carries any authority.
 *
 * That is why the validator is as interested in what it *refuses* as in what
 * it accepts. A pasted document that says `"status": "published"` is not
 * asking a question the importer is allowed to answer.
 *
 * Pure, and free of React and the DOM, so the rules can be tested directly.
 */

/** Everything a real block type is, minus the one that names a component. */
const IMPORTABLE_TYPES = new Set<BlockType>(
  (Object.keys(BLOCK_HINTS) as BlockType[]).filter((type) => type !== "custom")
);

/**
 * Keys that describe a row's identity or its place on the public site.
 *
 * Accepting any of these would let a pasted file claim to *be* an existing
 * project, or to already be published. They are dropped and named in the
 * summary rather than dropped quietly, so it is obvious the importer ignored
 * them on purpose.
 */
const REFUSED_KEYS = [
  "id",
  "owner_id",
  "user_id",
  "created_at",
  "updated_at",
  "published_at",
  "status",
  "mutation_id",
  "mutationId",
  "slug",
];

export interface ImportSummary {
  /** What the document called itself, if anything. */
  title: string | null;
  blocks: Block[];
  /** "4 headings, 5 text" — counted by type for the preview. */
  counts: { type: BlockType; count: number }[];
  /** Things that were changed or could not be represented. */
  warnings: string[];
  /** Identity/publication fields that were present and deliberately ignored. */
  refused: string[];
}

export type ImportOutcome =
  | { ok: true; summary: ImportSummary }
  | { ok: false; error: string };

/* ── making blocks the editor will accept ─────────────────── */

let counter = 0;

/**
 * Fresh ids, always.
 *
 * An imported document must never bring a block id with it: the id is how the
 * editor and the database identify a row, and an import that supplied one
 * could overwrite an unrelated block. `import-` marks where they came from;
 * the editor treats them exactly like its own `new-` ids.
 */
function freshId(): string {
  counter += 1;
  return `import-${Date.now().toString(36)}-${counter.toString(36)}`;
}

/** Positions are assigned by order, never taken from the file. */
export function toBlocks(entries: { type: BlockType; data: Record<string, unknown> }[]): Block[] {
  return entries.map((entry, position) => ({
    id: freshId(),
    type: entry.type,
    position,
    data: entry.data,
  }));
}

/* ── Studio JSON v1 ───────────────────────────────────────── */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parses the studio's own document format.
 *
 * This is the format worth generating from a script or from a chat with a
 * model: it is declarative, it is the same vocabulary the editor already uses,
 * and — because of the refusals below — the worst a malicious one can do is
 * waste your time.
 */
export function parseStudioJson(raw: string, kind: "project" | "journal"): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't valid JSON. Check for a missing comma or bracket." };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "A Studio document has to be a JSON object." };
  }

  const version = parsed.version;
  if (version !== 1 && version !== undefined) {
    return {
      ok: false,
      error: `This says it is version ${String(version)}. Studio understands version 1.`,
    };
  }

  const documentKind = parsed.kind;
  if (documentKind !== undefined && documentKind !== kind) {
    return {
      ok: false,
      error: `This is a ${String(documentKind)} document and you are editing a ${kind}.`,
    };
  }

  if (!Array.isArray(parsed.blocks)) {
    return { ok: false, error: "A Studio document needs a `blocks` array." };
  }

  const warnings: string[] = [];
  const refused = REFUSED_KEYS.filter((key) => key in parsed);
  const entries: { type: BlockType; data: Record<string, unknown> }[] = [];

  parsed.blocks.forEach((candidate, index) => {
    if (!isPlainObject(candidate)) {
      warnings.push(`Block ${index + 1} wasn't an object and was skipped.`);
      return;
    }
    const type = candidate.type;
    if (typeof type !== "string" || !IMPORTABLE_TYPES.has(type as BlockType)) {
      warnings.push(`Block ${index + 1} is a "${String(type)}" block, which Studio can't import.`);
      return;
    }
    const data = isPlainObject(candidate.data) ? candidate.data : {};

    // Markup arriving as data gets the same treatment as markup typed by hand.
    if (type === "html") {
      entries.push({ type, data: { ...data, html: sanitizeStudioHtml(String(data.html ?? "")) } });
      return;
    }
    entries.push({ type: type as BlockType, data });
  });

  if (entries.length === 0) {
    return { ok: false, error: "There were no blocks Studio could use in that document." };
  }

  // A block that is the right *kind* can still be the wrong *shape*, and until
  // now nothing looked. `{ type: "heading", data: { text: { bad: "shape" } } }`
  // imported cleanly and then took the published article down with "Objects
  // are not valid as a React child". The contract is shared with the sync
  // endpoint so the two doors cannot drift — see lib/block-contract.ts.
  const problem = firstBlockProblem(entries);
  if (problem) return { ok: false, error: problem };

  return {
    ok: true,
    summary: {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : null,
      blocks: toBlocks(entries),
      counts: countByType(entries),
      warnings,
      refused,
    },
  };
}

/* ── raw HTML ─────────────────────────────────────────────── */

/**
 * What to do with pasted markup, and why it is a question the author answers.
 *
 * `whole` keeps it as one Custom HTML block: exactly what you pasted, classes
 * and layout intact, editable as markup. Right for a design — a section with
 * its own grid loses that grid the moment it is broken into paragraphs.
 *
 * `blocks` converts what maps and keeps the rest as Custom HTML. Right for an
 * article, which wants the site's typography, one-paragraph-at-a-time editing
 * and reordering — none of which an opaque block can offer.
 *
 * Neither is the better answer in general, which is why neither is silent.
 */
export type HtmlImportMode = "whole" | "blocks";

/**
 * Pasted markup, kept whole.
 *
 * Sanitised, never executed, and not taken apart: what the preview shows is
 * what the page will show.
 */
export function parseHtmlDocument(
  raw: string,
  mode: HtmlImportMode = "whole"
): ImportOutcome {
  if (mode === "blocks") return convertHtmlDocument(raw);

  const html = sanitizeStudioHtml(raw);
  if (!html.trim()) {
    return {
      ok: false,
      error: "Nothing usable was left after removing scripts and styles.",
    };
  }

  const warnings: string[] = [];
  if (html.replace(/\s+/g, "") !== raw.replace(/\s+/g, "")) {
    warnings.push("Scripts, styles and frames were removed. Everything else was kept.");
  }
  warnings.push("This stays as one Custom HTML block — it is not split into editable blocks.");

  const entries = [{ type: "html" as BlockType, data: { html } }];
  return {
    ok: true,
    summary: {
      title: null,
      blocks: toBlocks(entries),
      counts: countByType(entries),
      warnings,
      refused: [],
    },
  };
}

/**
 * Pasted markup, converted.
 *
 * The walk itself is in lib/studio-import-html.ts; this is the part that turns
 * its result into the same summary every other importer produces, so the
 * preview does not need to know which door the content came through.
 */
export function convertHtmlDocument(raw: string): ImportOutcome {
  const { title, entries, warnings } = convertHtmlToBlocks(raw);

  // A page that was nothing but its own <h1> did convert: it produced a title.
  // Refusing that would be refusing the only thing it had to give.
  if (entries.length === 0 && !title) {
    return {
      ok: false,
      error:
        "Nothing convertible was found. Try “Keep as one HTML block” if this is a layout rather than an article.",
    };
  }

  return {
    ok: true,
    summary: {
      title,
      blocks: toBlocks(entries),
      counts: countByType(entries),
      warnings,
      refused: [],
    },
  };
}

/* ── shared ───────────────────────────────────────────────── */

export function countByType(
  entries: { type: BlockType }[]
): { type: BlockType; count: number }[] {
  const tally = new Map<BlockType, number>();
  for (const entry of entries) tally.set(entry.type, (tally.get(entry.type) ?? 0) + 1);
  return [...tally.entries()].map(([type, count]) => ({ type, count }));
}

/** "4 headings · 5 text · 1 photo" — the preview's one-line inventory. */
const PLURAL: Partial<Record<BlockType, [string, string]>> = {
  heading: ["heading", "headings"],
  paragraph: ["text", "text"],
  image: ["photo", "photos"],
  gallery: ["gallery", "galleries"],
  quote: ["quote", "quotes"],
  code: ["code block", "code blocks"],
  divider: ["divider", "dividers"],
  markdown: ["markdown block", "markdown blocks"],
  html: ["HTML block", "HTML blocks"],
};

export function describeCounts(counts: { type: BlockType; count: number }[]): string[] {
  return counts.map(({ type, count }) => {
    const [one, many] = PLURAL[type] ?? [type, `${type} blocks`];
    return `${count} ${count === 1 ? one : many}`;
  });
}

/**
 * One line describing what a block actually contains.
 *
 * The preview used to show only a tally — "6 blocks · 2 headings · 4 text" —
 * which answers how much arrived and not what it is. Two documents with
 * identical tallies can be completely different documents, and the one thing
 * worth checking before pressing Add is whether the *structure* came through:
 * did the headings land as headings, is that table still a table, did the
 * photos survive. So the preview shows the outline, and this is one row of it.
 *
 * Truncated hard. It is an outline, not a rendering.
 */
export function describeBlock(block: Block): string {
  const data = block.data ?? {};
  const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();

  switch (block.type) {
    case "heading":
      return text(data.text);
    case "paragraph":
      return text(data.text);
    case "markdown":
      return text(data.md);
    case "quote":
      return text(data.source) ? `${text(data.text)} — ${text(data.source)}` : text(data.text);
    case "code":
      return `${text(data.language) || "text"} · ${text(data.code)}`;
    case "image":
      return text(data.caption) || text(data.alt) || text(data.public_id ?? data.src);
    case "gallery":
      return `${Array.isArray(data.items) ? data.items.length : 0} photos`;
    case "divider":
      return text(data.style) || "line";
    case "button":
      return `${text(data.label)} → ${text(data.href)}`;
    case "link":
      return text(data.title) || text(data.url);
    case "file":
      return text(data.filename) || text(data.public_id ?? data.src);
    case "youtube":
      return text(data.youtube_id);
    case "embed":
      return text(data.url);
    case "html":
      // The markup itself is the wrong thing to show — it is the part you
      // cannot read. What matters is how much of it there is, and that it is
      // being kept rather than converted.
      return `${text(data.html).length} characters of markup`;
    default:
      return "";
  }
}

/** The outline, capped: a preview of two hundred blocks is not a preview. */
export function outline(
  blocks: Block[],
  limit = 12
): { shown: { type: BlockType; detail: string }[]; hidden: number } {
  return {
    shown: blocks
      .slice(0, limit)
      .map((block) => ({ type: block.type, detail: describeBlock(block) })),
    hidden: Math.max(0, blocks.length - limit),
  };
}

/** How imported blocks join what is already there. */
export type ImportMode = "append" | "replace";

/**
 * Append is the default and Replace is a decision.
 *
 * Neither touches the public site — that is the editor's business, and it does
 * not happen without Update live.
 */
export function applyImport(
  existing: Block[],
  incoming: Block[],
  mode: ImportMode
): Block[] {
  const combined = mode === "replace" ? incoming : [...existing, ...incoming];
  return combined.map((block, position) => ({ ...block, position }));
}
