import { useId, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { InView } from "./in-view";

/**
 * Shapes, in two boxes. Underlines live in a short 200×14 box with the stroke
 * near the bottom, so they tuck under a heading instead of striking through
 * it; enclosing shapes (circle, bracket) keep a tall 200×60 one.
 */
const SHAPES = {
  underline: { d: "M3 9 C 45 5, 95 12, 135 8 C 168 5, 186 10, 197 8", vb: [200, 14] },
  underline2: { d: "M3 8 Q 52 13, 102 8 Q 152 3, 197 9", vb: [200, 14] },
  scribble: {
    d: "M3 9 C 20 4, 38 12, 56 8 C 74 4, 92 12, 110 8 C 128 4, 146 12, 164 8 C 178 5, 190 11, 197 8",
    vb: [200, 14],
  },
  wave: { d: "M3 8 Q 27 3, 51 8 Q 75 13, 99 8 Q 123 3, 147 8 Q 171 13, 197 8", vb: [200, 14] },
  zigzag: { d: "M3 10 L 26 5 L 49 10 L 72 5 L 95 10 L 118 5 L 141 10 L 164 5 L 187 10 L 197 7", vb: [200, 14] },
  arrow: { d: "M3 8 C 60 6, 120 10, 188 8 M 173 4 L 197 8 L 173 12", vb: [200, 14] },
  circle: {
    d: "M 100 6 C 162 6 197 28 197 33 C 197 50 156 56 100 56 C 44 56 3 50 3 35 C 3 22 40 6 100 6",
    vb: [200, 60],
  },
  bracket: { d: "M 34 5 L 5 5 L 5 55 L 34 55 M 166 5 L 195 5 L 195 55 L 166 55", vb: [200, 60] },
} satisfies Record<string, { d: string; vb: [number, number] }>;

export type PenShape = keyof typeof SHAPES;

/** Every shape the pen draws, in the order they are listed above. */
export const PEN_SHAPES = Object.keys(SHAPES) as PenShape[];

/**
 * A pen shape, or the brush: a highlighter swipe rather than a pen line — a
 * flat ellipse, tapered at both ends and tilted a little, as wide as its
 * holder and 0.045em thick, so it keeps its proportions under any size of
 * heading. It is the stroke Home had under the name before this was
 * animated, now swept in from its left end.
 *
 * The marker is the same highlighter pressed flat behind a word rather than
 * swept under it: most of the word's height, square at the ends, tilted a
 * degree. The headings on About's sheet wear it, as they did on the old
 * About Me page it is drawn from.
 */
export type HandDrawnVariant = PenShape | "brush" | "marker";

/**
 * The site's pens. `hl` is the highlighter: the same bright yellow in both
 * themes, where `pen` darkens to amber on Paper so that yellow link text
 * stays readable on cream.
 */
const TONES = {
  pen: "text-pen",
  hl: "text-hl",
  red: "text-red",
  cyan: "text-cyan",
  green: "text-green",
} as const;

export type HandDrawnTone = keyof typeof TONES;

/**
 * A line drawing itself under, around or beside a word — the pen going back
 * over the thing that matters.
 *
 * This was DrawAccent, and it keeps DrawAccent's eight shapes and its trick:
 * a path that measures 1 (`pathLength="1"`), so a single dash of length 1 is
 * the whole stroke, and moving that dash's offset from 1 to 0 draws it end to
 * end. The drawing is a CSS animation in components/bits/bits.css, which
 * makes this a server component. With `trigger="load"` it ships no
 * JavaScript at all, and the line draws as soon as the stylesheet arrives
 * rather than after the page hydrates.
 *
 * ── the dash is on a mask, not on the line ──
 *
 * DrawAccent dashed the visible line itself, and that line is
 * `non-scaling-stroke` so a stretched (`fluid`) underline keeps an even pen
 * weight. But a non-scaling stroke is dashed in screen pixels: the dash
 * "1 path length" came out as ~194px — the shape's length in its own 200-wide
 * box — whatever the line was stretched to. Under a word wider than that the
 * pen stopped short. Measured on About at 1440: a 289px word, a 194px line.
 *
 * So the visible line is never dashed. It is revealed through a mask: the
 * same path again, wide, drawn in the SVG's own coordinates — where "1 path
 * length" is always the whole path, however the box is stretched — and it is
 * the mask's dash that moves. Finished, the mask covers the line completely,
 * so the end state is the plain line, pixel for pixel.
 *
 * `trigger="view"` waits until the line is on screen (see InView) — for a
 * line far enough down a page that it would otherwise finish drawing long
 * before anyone scrolled to it.
 *
 * `variant="brush"` (and the marker) is not drawn with the pen at all (see HandDrawnVariant).
 * It is a plain element grown from its left end with `scale`, which the
 * compositor runs on its own: nothing is repainted while it sweeps, where the
 * pen's mask repaints on every frame. That matters on a first screen.
 *
 * Decoration only. The line is aria-hidden; whatever it underlines is the
 * real text beside it. Reduced motion, printing and a browser without
 * JavaScript all get the finished line.
 */
export function HandDrawnReveal({
  variant = "underline",
  tone = "pen",
  trigger = "load",
  delay = 200,
  duration,
  width = 180,
  fluid = false,
  strokeWidth = 3,
  className,
}: {
  variant?: HandDrawnVariant;
  tone?: HandDrawnTone;
  /** "load" draws as the page opens; "view" when the line scrolls into sight. */
  trigger?: "load" | "view";
  /** Milliseconds before the pen starts. */
  delay?: number;
  /** Milliseconds the stroke takes; --motion-draw when left out. */
  duration?: number;
  /** A fixed pixel width. Ignored when `fluid` is set, and by the brush and the marker. */
  width?: number;
  /**
   * Stretch to whatever contains this, instead of taking a fixed size.
   *
   * An underline sits in a holder sized to the *word*, and that is a different
   * width in every heading and at every breakpoint. A fixed number cannot be
   * right for all of them: measured on About at 390, the word was 160px while
   * the accent asked for 260px, so the holder's `overflow-hidden` cropped 38%
   * of the squiggle and what survived read as a stray mark rather than a drawn
   * line.
   *
   * `preserveAspectRatio="none"` is deliberate — the squiggle is meant to look
   * drawn under *that* word, so stretching it is the point, and
   * `vectorEffect="non-scaling-stroke"` keeps the pen weight even while it does.
   */
  fluid?: boolean;
  /** The pen's weight in pixels. The brush's is always 0.045em, the marker's 0.62em. */
  strokeWidth?: number;
  className?: string;
}) {
  const mask = useId();
  const shape = SHAPES[variant as PenShape] ?? SHAPES.underline;
  const [vbW, vbH] = shape.vb;
  const height = Math.round((width / vbW) * vbH);
  const timing = {
    "--bits-draw-delay": `${Math.max(0, delay)}ms`,
    ...(duration != null && { "--bits-draw-duration": `${Math.max(0, duration)}ms` }),
  } as CSSProperties;

  if (variant === "brush" || variant === "marker") {
    const brush = (
      <span
        aria-hidden
        data-trigger={trigger}
        className={cn("bits-brush", variant === "marker" && "bits-marker", TONES[tone] ?? TONES.pen, className)}
        style={timing}
      />
    );
    return trigger === "view" ? (
      <InView as="span" className="bits-draw-holder">
        {brush}
      </InView>
    ) : (
      brush
    );
  }
  // How wide the mask's stroke must be, in the box's own units, to cover the
  // visible one with room to spare: the pen weight in pixels, divided by how
  // much the box is scaled. A fluid box is stretched sideways by an amount
  // only the page knows, but its height is fixed — and an underline's
  // thickness is measured vertically.
  const scale = fluid ? height / vbH : width / vbW;
  const reach = Math.round((strokeWidth / scale) * 2.5 * 10) / 10;

  const line = (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      fill="none"
      aria-hidden
      data-trigger={trigger}
      className={cn("bits-draw", TONES[tone] ?? TONES.pen, className)}
      style={timing}
    >
      <mask id={mask} maskUnits="userSpaceOnUse" x={-vbW / 2} y={-vbH} width={vbW * 2} height={vbH * 3}>
        <path
          d={shape.d}
          className="bits-draw-ink"
          stroke="white"
          strokeWidth={reach}
          strokeLinecap="round"
          strokeLinejoin="round"
          // The whole stroke measures 1, so the dash that draws it can be 1
          // too, whatever the shape's real length.
          pathLength={1}
        />
      </mask>
      <path
        d={shape.d}
        mask={`url(#${mask})`}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );

  if (trigger === "view") {
    return (
      <InView as="span" className="bits-draw-holder">
        {line}
      </InView>
    );
  }
  return line;
}
