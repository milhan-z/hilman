import assert from "node:assert/strict";
import test from "node:test";
import {
  EDGE_MAX_SPEED_PX,
  EDGE_ZONE_PX,
  LONG_PRESS_MS,
  SHEET_DISMISS_PX,
  describePosition,
  distanceBetween,
  edgeScrollVelocity,
  longPressCancelled,
  moveItem,
  normalisePositions,
  sheetDragOffset,
  sheetDragProgress,
  shouldActivateLongPress,
  shouldDismissSheet,
} from "../lib/studio-gestures";

/**
 * The two judgement calls the studio's touch gestures come down to.
 *
 * Both are the difference between a gesture that works and one that fires when
 * you were trying to do something else — a page that will not scroll because
 * every touch picks a block up, a sheet that vanishes because you nudged it.
 */

/* ── holding a grip ───────────────────────────────────────── */

test("a hold that stays put becomes a drag", () => {
  assert.equal(shouldActivateLongPress({ elapsed: LONG_PRESS_MS, distance: 0 }), true);
  assert.equal(shouldActivateLongPress({ elapsed: 400, distance: 3 }), true);
});

test("a hold that has not waited long enough is not a drag yet", () => {
  assert.equal(shouldActivateLongPress({ elapsed: 150, distance: 2 }), false);
  assert.equal(shouldActivateLongPress({ elapsed: LONG_PRESS_MS - 1, distance: 0 }), false);
});

test("a finger that travels is scrolling, however long it stays down", () => {
  assert.equal(shouldActivateLongPress({ elapsed: 1000, distance: 12 }), false);
  assert.equal(longPressCancelled({ distance: 12 }), true);
});

test("a thumb resting on a grip is allowed to wobble", () => {
  assert.equal(longPressCancelled({ distance: 0 }), false);
  assert.equal(longPressCancelled({ distance: 8 }), false);
  assert.equal(longPressCancelled({ distance: 8.1 }), true);
});

test("distance is measured in both directions, not just down", () => {
  assert.equal(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  // A sideways swipe cancels a hold exactly as a vertical one does.
  assert.equal(longPressCancelled({ distance: distanceBetween({ x: 0, y: 0 }, { x: 20, y: 0 }) }), true);
});

/* ── swiping a sheet away ─────────────────────────────────── */

test("a nudge springs back", () => {
  assert.equal(shouldDismissSheet({ distance: 20, velocity: 0.05 }), false);
  assert.equal(shouldDismissSheet({ distance: SHEET_DISMISS_PX - 1, velocity: 0 }), false);
});

test("a long pull dismisses however slowly it was made", () => {
  assert.equal(shouldDismissSheet({ distance: SHEET_DISMISS_PX, velocity: 0 }), true);
  assert.equal(shouldDismissSheet({ distance: 300, velocity: 0 }), true);
});

test("a short flick dismisses too", () => {
  assert.equal(shouldDismissSheet({ distance: 40, velocity: 1.2 }), true);
});

test("an upward flick never dismisses a sheet that opens upward", () => {
  assert.equal(shouldDismissSheet({ distance: 0, velocity: -3 }), false);
  assert.equal(shouldDismissSheet({ distance: -40, velocity: -3 }), false);
});

test("dragging a sheet upward is damped rather than ignored", () => {
  assert.equal(sheetDragOffset(60), 60);
  assert.equal(sheetDragOffset(-60), -15);
});

test("the backdrop fades with the drag and never past fully gone", () => {
  assert.equal(sheetDragProgress(0), 0);
  assert.equal(sheetDragProgress(-40), 0);
  assert.equal(sheetDragProgress(120, 240), 0.5);
  assert.equal(sheetDragProgress(9999), 1);
});

/* ── moving a block ───────────────────────────────────────── */

const ids = (items: { id: string }[]) => items.map((item) => item.id).join("");
const list = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

test("a block can be moved to any position", () => {
  assert.equal(ids(moveItem(list, 0, 2)), "bca");
  assert.equal(ids(moveItem(list, 2, 0)), "cab");
  assert.equal(ids(moveItem(list, 1, 2)), "acb");
});

test("moving a block past either end stops at the end", () => {
  assert.equal(ids(moveItem(list, 0, -5)), "abc");
  assert.equal(ids(moveItem(list, 0, 99)), "bca");
});

test("moving nowhere changes nothing, and never mutates the original", () => {
  const moved = moveItem(list, 1, 1);
  assert.equal(ids(moved), "abc");
  assert.notEqual(moved, list);
  assert.equal(ids(list), "abc");
});

test("positions are rewritten to match the new order", () => {
  const reordered = moveItem(list, 0, 2);
  assert.deepEqual(
    normalisePositions(reordered).map((item) => [item.id, item.position]),
    [
      ["b", 0],
      ["c", 1],
      ["a", 2],
    ]
  );
});

test("a list already in order is left alone object-for-object", () => {
  const same = normalisePositions(list);
  // The database orders by `position`; rewriting untouched rows would make
  // every reorder look like it changed more than it did.
  assert.equal(same[0], list[0]);
  assert.equal(same[1], list[1]);
});

test("positions are announced from one, not from zero", () => {
  assert.equal(describePosition(0, 7), "Position 1 of 7");
  assert.equal(describePosition(6, 7), "Position 7 of 7");
});

/* ── scrolling the page while dragging ────────────────────── */

const viewportHeight = 844;
const scroll = (pointerY: number, extra: Record<string, number> = {}) =>
  edgeScrollVelocity({ pointerY, viewportHeight, ...extra });

test("the middle of the screen never scrolls", () => {
  assert.equal(scroll(400), 0);
  assert.equal(scroll(viewportHeight / 2), 0);
});

test("nearing the bottom scrolls down, nearing the top scrolls up", () => {
  assert.ok(scroll(viewportHeight - 10) > 0);
  assert.ok(scroll(10) < 0);
});

test("speed ramps with proximity rather than switching on", () => {
  const near = scroll(viewportHeight - EDGE_ZONE_PX + 10);
  const nearer = scroll(viewportHeight - 20);
  const edge = scroll(viewportHeight);
  assert.ok(near > 0 && nearer > near, `${near} then ${nearer}`);
  assert.ok(edge >= nearer);
});

test("speed is capped at the edge and beyond it", () => {
  assert.equal(scroll(viewportHeight + 500), EDGE_MAX_SPEED_PX);
  assert.equal(scroll(-500), -EDGE_MAX_SPEED_PX);
});

test("the zones sit inside the app's own chrome", () => {
  // A finger just below a 100px header is at the top of the document, not in
  // the scroll-up zone — the zone starts below the header, not below the
  // screen edge.
  assert.ok(scroll(150, { topInset: 100 }) < 0);
  assert.equal(scroll(250, { topInset: 100 }), 0);
  // And the save bar at the bottom gets the same treatment.
  assert.equal(scroll(viewportHeight - 96 - EDGE_ZONE_PX - 10, { bottomInset: 96 }), 0);
  assert.ok(scroll(viewportHeight - 96, { bottomInset: 96 }) > 0);
});
