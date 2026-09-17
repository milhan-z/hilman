import type { BlockType } from "./types";

/**
 * How a media block is presented, separately from what it contains.
 *
 * The content model does not change here. An image is an `image`, a gallery is
 * a `gallery`, and neither gains a sibling type called `browser-image` or
 * `carousel-gallery`. What they gain is one optional key saying how to draw
 * what they already hold — so the same three photographs can be a grid in one
 * case study and a stack of screenshots in another without the database
 * knowing anything new.
 *
 * ── the rules that make this safe to add to live content ──
 *
 * Everything already published has no `layout` at all, except galleries, which
 * have had one since the beginning. So:
 *
 *   missing            → the default, which is today's rendering, exactly
 *   unknown/invalid    → the same default, never a crash
 *   "grid" / "columns" → what those already mean for a gallery, unchanged
 *
 * That last line is the one worth being careful about. `gallery.data.layout`
 * is not a new field: live rows hold `"grid"` and `"columns"` right now, and
 * `"columns"` means a two-up grid rather than the three-up default. It stays a
 * valid value and stays rendering the way it does today. It is simply not
 * offered in the picker any more — the four V1 presentations are the menu, and
 * `"columns"` is a grid either way.
 *
 * Resolution is total: every one of these functions returns a real layout for
 * any input, including `null`, `undefined`, a number, or a string from a
 * future version of the studio. The public renderer can therefore switch on
 * the result without a default case that throws.
 */

/* ── image ────────────────────────────────────────────────── */

export const IMAGE_LAYOUTS = ["default", "full", "browser", "phone", "polaroid"] as const;
export type ImageLayout = (typeof IMAGE_LAYOUTS)[number];
export const DEFAULT_IMAGE_LAYOUT: ImageLayout = "default";

/* ── gallery ──────────────────────────────────────────────── */

/** The four offered in the picker. */
export const GALLERY_LAYOUTS = ["grid", "carousel", "stack", "accordion"] as const;
export type GalleryLayout = (typeof GALLERY_LAYOUTS)[number];
export const DEFAULT_GALLERY_LAYOUT: GalleryLayout = "grid";

/**
 * `"columns"` predates this whole feature and is still in the database.
 * Accepted and rendered, never offered.
 */
export const LEGACY_GALLERY_LAYOUT = "columns";
export type GalleryLayoutResolved = GalleryLayout | typeof LEGACY_GALLERY_LAYOUT;

/* ── loop clip ────────────────────────────────────────────── */

export const LOOP_CLIP_LAYOUTS = ["default", "browser", "phone", "floating"] as const;
export type LoopClipLayout = (typeof LOOP_CLIP_LAYOUTS)[number];
export const DEFAULT_LOOP_CLIP_LAYOUT: LoopClipLayout = "default";

/* ── youtube ──────────────────────────────────────────────── */

export const YOUTUBE_LAYOUTS = ["default", "cinema"] as const;
export type YouTubeLayout = (typeof YOUTUBE_LAYOUTS)[number];
export const DEFAULT_YOUTUBE_LAYOUT: YouTubeLayout = "default";

/* ── resolution ───────────────────────────────────────────── */

type Data = Record<string, any> | null | undefined;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

export const resolveImageLayout = (data: Data): ImageLayout =>
  pick(data?.layout, IMAGE_LAYOUTS, DEFAULT_IMAGE_LAYOUT);

/** Returns `"columns"` for the legacy value, so the grid can keep honouring it. */
export function resolveGalleryLayout(data: Data): GalleryLayoutResolved {
  if (data?.layout === LEGACY_GALLERY_LAYOUT) return LEGACY_GALLERY_LAYOUT;
  return pick(data?.layout, GALLERY_LAYOUTS, DEFAULT_GALLERY_LAYOUT);
}

export const resolveLoopClipLayout = (data: Data): LoopClipLayout =>
  pick(data?.layout, LOOP_CLIP_LAYOUTS, DEFAULT_LOOP_CLIP_LAYOUT);

export const resolveYouTubeLayout = (data: Data): YouTubeLayout =>
  pick(data?.layout, YOUTUBE_LAYOUTS, DEFAULT_YOUTUBE_LAYOUT);

/* ── what the picker offers ───────────────────────────────── */

export interface LayoutChoice {
  value: string;
  label: string;
  /** One line under the label — what this presentation is *for*. */
  detail: string;
}

/**
 * The menu, per block type.
 *
 * Kept beside the types rather than in the picker component so a layout cannot
 * exist in the union and be missing from the UI, or vice versa — there is a
 * test that holds those two together.
 */
export const LAYOUT_CHOICES: Partial<Record<BlockType, LayoutChoice[]>> = {
  image: [
    { value: "default", label: "Default", detail: "How images look everywhere else" },
    // Not "wider": width is what Layout Width is for, and two controls
    // fighting over the same dimension is the bug this feature was careful to
    // avoid. Full is the frame coming off. Set both for something immersive.
    { value: "full", label: "Full", detail: "No frame — the photo fills the column" },
    { value: "browser", label: "Browser", detail: "For website and dashboard screenshots" },
    { value: "phone", label: "Phone", detail: "For mobile app and responsive screens" },
    { value: "polaroid", label: "Polaroid", detail: "A printed photo — events, journals" },
  ],
  gallery: [
    { value: "grid", label: "Grid", detail: "Everything visible at once" },
    { value: "carousel", label: "Carousel", detail: "Swipe through a series, one at a time" },
    { value: "stack", label: "Stack", detail: "Overlapping shots — chats, process, moments" },
    { value: "accordion", label: "Accordion", detail: "Panels that open one at a time" },
  ],
  "loop-clip": [
    { value: "default", label: "Default", detail: "How clips look everywhere else" },
    { value: "browser", label: "Browser", detail: "For a web interaction or coding demo" },
    { value: "phone", label: "Phone", detail: "For a screen recording from a phone" },
    { value: "floating", label: "Floating", detail: "Lifted off the page a little" },
  ],
  youtube: [
    { value: "default", label: "Default", detail: "How videos look everywhere else" },
    { value: "cinema", label: "Cinema", detail: "Darker, wider, more of a screening" },
  ],
};

/** Whether this block type has presentations to choose from at all. */
export const hasLayoutChoices = (type: BlockType): boolean => Boolean(LAYOUT_CHOICES[type]);

/**
 * The value the picker should show as selected.
 *
 * A gallery still holding the legacy `"columns"` reads as Grid, because that
 * is what it is. Choosing Grid from the picker then writes `"grid"` — an
 * author-initiated change from a two-up to a three-up grid, visible
 * immediately in the canvas, rather than something that happened to their
 * content while they were not looking.
 */
export function selectedLayoutValue(type: BlockType, data: Data): string {
  switch (type) {
    case "image":
      return resolveImageLayout(data);
    case "gallery": {
      const resolved = resolveGalleryLayout(data);
      return resolved === LEGACY_GALLERY_LAYOUT ? DEFAULT_GALLERY_LAYOUT : resolved;
    }
    case "loop-clip":
      return resolveLoopClipLayout(data);
    case "youtube":
      return resolveYouTubeLayout(data);
    default:
      return "";
  }
}
