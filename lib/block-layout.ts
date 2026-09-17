import { cn } from "./utils";

/**
 * How far across the page a block sits, and how much air is around it.
 *
 * These two keys belong to every block type rather than to any one of them,
 * which is why they live here and not in the renderer beside the components
 * that draw a heading or a photo.
 *
 * ── why `span` and not `width` ──
 *
 * This used to be `data.width`, and `data.width` already meant something else.
 * On an image block the renderer passes it to <Pic width={…}> as a pixel
 * number, so the same key was read as `800` by one reader and as `"wide"` by
 * the other. Both readings were reachable from the editor: the property
 * drawer offered "Layout Width" on image blocks, and choosing Wide wrote
 * `width: "wide"`, which came out the far end as a Cloudinary transform
 * reading `w_wide,c_limit` — an invalid URL, and a broken photo on the public
 * site. Neither reader could tell it had been handed the other one's value.
 *
 * `layout` was the obvious new name and is also taken: the gallery block has
 * used `data.layout` for `grid | columns` since the beginning, on live rows.
 * Renaming into it would have rebuilt the same fault one block over. `span`
 * is free across the whole corpus, and it says the thing — how far across the
 * page this block spans.
 *
 * ── reading old content ──
 *
 * Nothing in the database had to be migrated: an audit of all 97 block rows
 * found no `width` on any of them, and one `spacing`. But a draft sitting in
 * IndexedDB on the owner's phone, an exported Studio JSON file, or a document
 * written against the old shape can still carry `width: "wide"`, so the
 * fallback below keeps reading it. The disambiguation is the value's type,
 * not a guess: a *string* naming a span is a span, a *number* is pixels, and
 * neither reader can be handed the other's value any more.
 */

/** The three widths a block can occupy, and the classes that produce them. */
export const SPAN_CLASSES = {
  prose: "max-w-prose mx-auto w-full px-5",
  wide: "max-w-content mx-auto w-full px-5 sm:px-8",
  full: "max-w-none w-full",
} as const;

/** Vertical rhythm around a block. */
export const SPACING_CLASSES = {
  none: "py-0",
  small: "py-2 sm:py-3.5",
  medium: "py-4 sm:py-7",
  large: "py-8 sm:py-16",
} as const;

export type BlockSpan = keyof typeof SPAN_CLASSES;
export type BlockSpacing = keyof typeof SPACING_CLASSES;

export const SPAN_VALUES = Object.keys(SPAN_CLASSES) as BlockSpan[];
export const SPACING_VALUES = Object.keys(SPACING_CLASSES) as BlockSpacing[];

export const DEFAULT_SPAN: BlockSpan = "prose";
export const DEFAULT_SPACING: BlockSpacing = "medium";

const isSpan = (value: unknown): value is BlockSpan =>
  typeof value === "string" && (SPAN_VALUES as string[]).includes(value);

const isSpacing = (value: unknown): value is BlockSpacing =>
  typeof value === "string" && (SPACING_VALUES as string[]).includes(value);

/**
 * The span a block asked for.
 *
 * `span` first, then a legacy string `width`. A numeric `width` is an image's
 * pixel width and is deliberately not consulted — it would miss the lookup and
 * fall through to the default anyway, but saying so here is what keeps the two
 * meanings apart on purpose rather than by accident.
 */
export function resolveSpan(data: Record<string, unknown> | null | undefined): BlockSpan {
  if (!data) return DEFAULT_SPAN;
  if (isSpan(data.span)) return data.span;
  if (isSpan(data.width)) return data.width;
  return DEFAULT_SPAN;
}

export function resolveSpacing(data: Record<string, unknown> | null | undefined): BlockSpacing {
  if (!data) return DEFAULT_SPACING;
  return isSpacing(data.spacing) ? data.spacing : DEFAULT_SPACING;
}

/** The wrapper classes for one block. */
export function blockLayoutClasses(data: Record<string, unknown> | null | undefined): string {
  return cn(SPAN_CLASSES[resolveSpan(data)], SPACING_CLASSES[resolveSpacing(data)]);
}

/**
 * A pixel dimension, or the fallback.
 *
 * Numbers pass through. Numeric strings are accepted because that is what an
 * imported document or a hand-written JSON block produces — `"800"` is plainly
 * eight hundred pixels. A string naming a span is not a dimension and never
 * reaches the image: that was the whole bug, and this is the line that stops
 * it, so `"wide"` comes back as the fallback rather than as `w_wide`.
 */
export function pixelDimension(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Strips a legacy span out of `width` when a block is edited.
 *
 * The readers understand both shapes, so nothing is broken by leaving an old
 * value in place — but a document that keeps carrying `width: "wide"` keeps
 * the ambiguity alive in every copy of itself. Normalising as the block is
 * edited retires it without a migration and without touching content nobody
 * opened.
 */
export function normalizeBlockLayout(
  data: Record<string, unknown>
): Record<string, unknown> {
  if (!isSpan(data.width)) return data;
  const { width, ...rest } = data;
  return { ...rest, span: isSpan(data.span) ? data.span : width };
}
