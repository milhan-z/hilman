/**
 * The arithmetic behind the studio's two touch gestures.
 *
 * Kept free of React and the DOM so the decisions can be tested without a
 * phone: "was that a hold or a scroll?" and "was that a dismiss or a nudge?"
 * are the only two questions, and both are pure functions of numbers.
 *
 * The thresholds are the interesting part, so they live here as named
 * constants rather than scattered through component props.
 */

/* ── holding a grip to pick a block up ────────────────────── */

/**
 * Long enough to be deliberate, short enough not to feel broken.
 *
 * 500ms is the usual web long-press figure, inherited from "open the context
 * menu". This is a tool its owner uses every day, so it sits at the bottom of
 * the range where a hold still reads as intentional.
 */
export const LONG_PRESS_MS = 280;

/**
 * How far a finger may wander before the hold is read as a scroll instead.
 *
 * A thumb resting on a 48px target drifts a few pixels without meaning to; a
 * scroll leaves immediately. 8px separates them without demanding stillness.
 */
export const LONG_PRESS_TOLERANCE_PX = 8;

export interface LongPressSample {
  /** Milliseconds since the pointer went down. */
  elapsed: number;
  /** Straight-line distance travelled since the pointer went down. */
  distance: number;
  delay?: number;
  tolerance?: number;
}

/** Whether a hold has earned the right to become a drag. */
export function shouldActivateLongPress({
  elapsed,
  distance,
  delay = LONG_PRESS_MS,
  tolerance = LONG_PRESS_TOLERANCE_PX,
}: LongPressSample): boolean {
  if (distance > tolerance) return false;
  return elapsed >= delay;
}

/**
 * Whether the finger has moved far enough that this is a scroll, not a hold.
 *
 * Separate from the above because it is checked on every pointermove while the
 * timer runs, and the answer "not yet" means something different from "no".
 */
export function longPressCancelled({
  distance,
  tolerance = LONG_PRESS_TOLERANCE_PX,
}: {
  distance: number;
  tolerance?: number;
}): boolean {
  return distance > tolerance;
}

export const distanceBetween = (
  a: { x: number; y: number },
  b: { x: number; y: number }
): number => Math.hypot(a.x - b.x, a.y - b.y);

/* ── swiping a sheet away ─────────────────────────────────── */

/** Roughly a thumb's comfortable downward travel, and a quarter of a sheet. */
export const SHEET_DISMISS_PX = 96;

/** px per millisecond. A flick clears this long before it clears the distance. */
export const SHEET_DISMISS_VELOCITY = 0.55;

export interface SheetDismissSample {
  /** How far down the sheet has been dragged. Never negative. */
  distance: number;
  /** Downward speed at release, px/ms. */
  velocity?: number;
  threshold?: number;
  velocityThreshold?: number;
}

/**
 * Whether releasing here should close the sheet or let it spring back.
 *
 * Velocity matters as much as distance: a fast flick from 30px is a clear
 * "go away", and requiring the full 96px would make the sheet feel sticky.
 */
export function shouldDismissSheet({
  distance,
  velocity = 0,
  threshold = SHEET_DISMISS_PX,
  velocityThreshold = SHEET_DISMISS_VELOCITY,
}: SheetDismissSample): boolean {
  if (distance <= 0) return false;
  if (distance >= threshold) return true;
  // A flick still has to be going somewhere — an upward flick never dismisses.
  return velocity >= velocityThreshold;
}

/**
 * Resistance past the top edge.
 *
 * Dragging a bottom sheet upward should feel like it is anchored rather than
 * like nothing is happening, so upward travel is allowed but heavily damped.
 */
export function sheetDragOffset(delta: number): number {
  if (delta >= 0) return delta;
  return delta / 4;
}

/** How much the backdrop has faded, 0–1, for a given drag distance. */
export function sheetDragProgress(distance: number, over = 240): number {
  if (distance <= 0) return 0;
  return Math.min(1, distance / over);
}

/* ── moving a block within a list ─────────────────────────── */

/** Moves one item and returns a new array. Out-of-range indices are clamped. */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return [...items];
  const target = Math.max(0, Math.min(items.length - 1, to));
  if (target === from) return [...items];

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return next;
}

/**
 * Rewrites `position` to match array order.
 *
 * The database orders blocks by this column, so the array being right is not
 * enough — it is the only thing the renderer and the public page agree on.
 */
export function normalisePositions<T extends { position: number }>(items: readonly T[]): T[] {
  return items.map((item, position) => (item.position === position ? item : { ...item, position }));
}

/** "Position 3 of 7" — what a screen reader is told after a move. */
export function describePosition(index: number, total: number): string {
  return `Position ${index + 1} of ${total}`;
}

/* ── scrolling the page while dragging a block ────────────── */

/**
 * How close to an edge a finger has to be before the page starts moving.
 *
 * Wide enough to reach without precision, narrow enough that an ordinary drop
 * near the bottom of the screen does not send the document flying.
 */
export const EDGE_ZONE_PX = 88;

/** Fastest the page moves per animation frame, at the very edge. */
export const EDGE_MAX_SPEED_PX = 14;

export interface EdgeScrollSample {
  /** Pointer position in viewport coordinates. */
  pointerY: number;
  viewportHeight: number;
  /** Chrome covering the top — the editor's fixed header. */
  topInset?: number;
  /** Chrome covering the bottom — the save bar. */
  bottomInset?: number;
  zone?: number;
  maxSpeed?: number;
}

/**
 * Pixels to scroll this frame: negative up, positive down, zero in the middle.
 *
 * Framer Motion has no auto-scroll of its own — verified by inspection of the
 * installed version, which contains no such code — so a block dragged to the
 * bottom of the screen simply stops there, and a twenty-block document cannot
 * be reordered end to end in one gesture. This is the arithmetic behind the
 * smallest fix: while a drag is in progress, move the page under the finger.
 *
 * The speed ramps with proximity rather than switching on. A constant speed
 * makes the document lurch the moment you cross an invisible line; ramping
 * means edging closer goes faster and you can stop precisely where you meant.
 */
export function edgeScrollVelocity({
  pointerY,
  viewportHeight,
  topInset = 0,
  bottomInset = 0,
  zone = EDGE_ZONE_PX,
  maxSpeed = EDGE_MAX_SPEED_PX,
}: EdgeScrollSample): number {
  const top = topInset + zone;
  const bottom = viewportHeight - bottomInset - zone;

  if (pointerY < top) {
    // 0 at the inner edge of the zone, 1 at the chrome itself and beyond.
    const depth = Math.min(1, (top - pointerY) / zone);
    return -Math.round(depth * maxSpeed);
  }
  if (pointerY > bottom) {
    const depth = Math.min(1, (pointerY - bottom) / zone);
    return Math.round(depth * maxSpeed);
  }
  return 0;
}
