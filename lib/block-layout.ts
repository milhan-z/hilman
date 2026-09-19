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

/**
 * What a photograph gets when nobody chose a width for it.
 *
 * Text and media were the same 672 px column at every size, which measured
 * badly in both directions at once: on a 1440 px screen every one of an
 * article's blocks — paragraph, gallery, video — came out at exactly 672 px,
 * so a photograph was cramped for no reason and the page had the mechanical
 * evenness of a form.
 *
 * A reading column has a right width and it is not very wide; a photograph
 * does not, and benefits from the room. So they stop sharing. Below `lg` this
 * is identical to `prose` — on a phone the column *is* the screen and there is
 * nothing to widen into — and only past a laptop's width does the media step
 * out, to 54rem and then 60rem.
 *
 * This is a *default*, not a ceiling. An author who sets `span` explicitly
 * still gets exactly what they asked for.
 *
 * ── and how wide is a page's business, not a block's ──
 *
 * The actual numbers come from two custom properties, so the *page* can say
 * how expansive its media should be without the block engine being forked or
 * a block learning which route it is on. A case study wants its photographs
 * large; a journal entry is a piece of writing that occasionally has a picture
 * in it, and the same width that reads as confident on the first reads as an
 * interruption on the second. Defaults and the quieter override both live in
 * app/globals.css.
 */
export const MEDIA_SPAN_CLASS =
  "max-w-prose lg:max-w-[var(--media-lg)] xl:max-w-[var(--media-xl)] mx-auto w-full px-5";

/**
 * Block types that take the wider default.
 *
 * Everything here is something you look at rather than read. `code` is in the
 * list because a wrapped line of code is a misread line of code, and `embed`
 * because the thing inside it was designed for a viewport, not a column.
 */
export const WIDE_BY_DEFAULT = new Set([
  "image",
  "gallery",
  "youtube",
  "loop-clip",
  "embed",
  "code",
]);

/** Vertical rhythm around a block. */
export const SPACING_CLASSES = {
  none: "py-0",
  small: "py-2 sm:py-3.5",
  medium: "py-4 sm:py-7",
  large: "py-8 sm:py-16",
} as const;

/**
 * The gap a block gets when nobody chose one.
 *
 * `medium` for everything was the old answer, and it made an article read as a
 * list of separate announcements: the space between two sentences of the same
 * thought was the same as the space between a paragraph and a gallery. Prose
 * needs to flow and media needs air, and one number cannot do both.
 *
 * Headings are deliberately `none` here — they carry their own `mt-12`/`mt-10`
 * in the renderer, and adding padding on top of that was stacking two
 * different systems' idea of a chapter break on top of each other.
 */
export function defaultSpacingFor(type: string | undefined): BlockSpacing {
  if (!type) return "medium";
  if (type === "heading") return "none";
  if (type === "divider") return "large";
  if (WIDE_BY_DEFAULT.has(type)) return "medium";
  // paragraph, markdown, quote, list-ish things: keep the thought together.
  return "small";
}

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

/**
 * The gap a block asked for, or the one its kind deserves.
 *
 * `type` is optional so every existing caller keeps working unchanged; when it
 * is missing the answer is the old `medium` for everything.
 */
export function resolveSpacing(
  data: Record<string, unknown> | null | undefined,
  type?: string
): BlockSpacing {
  if (data && isSpacing(data.spacing)) return data.spacing;
  return defaultSpacingFor(type);
}

/**
 * The wrapper classes for one block.
 *
 * `type` came out of this function once before, when it only fed a local that
 * nothing read. It is back for a real reason: width and rhythm now depend on
 * what kind of block this is, because a paragraph and a gallery genuinely want
 * different answers and pretending otherwise is what made every article 672 px
 * of evenly-spaced rectangles.
 *
 * An explicit `span` still wins over the type-based default — the author's
 * choice is not a suggestion.
 */
export function blockLayoutClasses(
  data: Record<string, unknown> | null | undefined,
  type?: string
): string {
  const chose = Boolean(data && (isSpan(data.span) || isSpan(data.width)));
  const span =
    !chose && type && WIDE_BY_DEFAULT.has(type)
      ? MEDIA_SPAN_CLASS
      : SPAN_CLASSES[resolveSpan(data)];

  return cn(span, SPACING_CLASSES[resolveSpacing(data, type)]);
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
