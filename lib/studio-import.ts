import { sanitizeStudioHtml } from "./studio-html";
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
 * Pasted markup becomes one Custom HTML block, not an attempt at conversion.
 *
 * Turning arbitrary HTML into native blocks sounds better than it is: the
 * mapping is lossy in both directions, and the failures are silent — a layout
 * that quietly loses a column, a class that stops applying. Keeping it whole
 * and sanitised means what you see in the preview is what the page will show,
 * and it stays editable as the thing you actually pasted.
 */
export function parseHtmlDocument(raw: string): ImportOutcome {
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
