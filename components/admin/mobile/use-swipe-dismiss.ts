"use client";

import { useCallback, useRef, useState } from "react";
import {
  sheetDragOffset,
  sheetDragProgress,
  shouldDismissSheet,
} from "@/lib/studio-gestures";

/**
 * Drag a panel down to make it go away.
 *
 * Bound to a handle, never to the panel. A sheet's content scrolls, and a
 * gesture that means "scroll this list" at the top of the list and "throw the
 * whole sheet away" a pixel further is not a gesture anyone can aim. Giving
 * drag its own 48px strip costs one row of pixels and removes the ambiguity
 * entirely.
 *
 * Pointer events rather than touch events: the same handler then covers a
 * finger, a trackpad and a stylus, and setPointerCapture keeps the events
 * coming when the finger leaves the handle — which it does immediately, since
 * the point of the gesture is to move away from where it started.
 *
 * Nothing here calls preventDefault. The handle sets `touch-action: none`, so
 * the browser has already been told this region does not scroll, and there is
 * no default left to fight.
 */

export interface SwipeDismissOptions {
  onDismiss: () => void;
  /** Turns the gesture off without changing anything else — desktop, mostly. */
  enabled?: boolean;
}

export interface SwipeDismissState {
  /** Pixels the sheet is currently displaced by. 0 when at rest. */
  offset: number;
  /** True between pointerdown and release, for switching off the transition. */
  dragging: boolean;
  /** 0–1: how far towards dismissal, for fading the backdrop. */
  progress: number;
  /** True if the last gesture actually moved — used to swallow the click. */
  movedRef: React.RefObject<boolean>;
  handleProps: {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
    onPointerMove: React.PointerEventHandler<HTMLElement>;
    onPointerUp: React.PointerEventHandler<HTMLElement>;
    onPointerCancel: React.PointerEventHandler<HTMLElement>;
  };
}

/** Past this, the gesture was a drag and the tap-to-close click is ignored. */
const TAP_SLOP_PX = 4;

/** Positions older than this are no longer part of "how fast is it going now". */
const VELOCITY_WINDOW_MS = 100;

/** Below this span the samples are too close together to divide by. */
const MIN_VELOCITY_WINDOW_MS = 24;

/** Downward px/ms over the trailing window, or 0 if it is too short to tell. */
function releaseVelocity(
  trail: { y: number; t: number }[],
  endY: number,
  endT: number
): number {
  const oldest = trail[0];
  if (!oldest) return 0;
  const span = endT - oldest.t;
  if (span < MIN_VELOCITY_WINDOW_MS) return 0;
  return (endY - oldest.y) / span;
}

export function useSwipeDismiss({
  onDismiss,
  enabled = true,
}: SwipeDismissOptions): SwipeDismissState {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const startY = useRef(0);
  const active = useRef(false);
  const moved = useRef(false);

  /**
   * A short trail of recent positions, for working out the release speed.
   *
   * Not the difference between the last two events: pointermove can deliver
   * two samples inside the same millisecond, and dividing a 10px step by a
   * 0.1ms gap reports a gentle drag as a 100px/ms flick — which dismissed
   * sheets that should have sprung back. Measuring across a window of at
   * least MIN_VELOCITY_WINDOW_MS makes the number mean something.
   */
  const trail = useRef<{ y: number; t: number }[]>([]);

  const reset = useCallback(() => {
    active.current = false;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!enabled || !event.isPrimary) return;
      // A right-click on the handle is not a drag.
      if (event.pointerType === "mouse" && event.button !== 0) return;

      active.current = true;
      moved.current = false;
      startY.current = event.clientY;
      trail.current = [{ y: event.clientY, t: event.timeStamp }];

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is an optimisation; the gesture still works without it.
      }
      setDragging(true);
    },
    [enabled]
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!active.current) return;

    const delta = event.clientY - startY.current;
    if (Math.abs(delta) > TAP_SLOP_PX) moved.current = true;

    trail.current.push({ y: event.clientY, t: event.timeStamp });
    const cutoff = event.timeStamp - VELOCITY_WINDOW_MS;
    while (trail.current.length > 2 && trail.current[0].t < cutoff) trail.current.shift();

    setOffset(sheetDragOffset(delta));
  }, []);

  const finish = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!active.current) return;
      active.current = false;

      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }

      const travelled = event.clientY - startY.current;
      const dismiss = shouldDismissSheet({
        distance: travelled,
        velocity: releaseVelocity(trail.current, event.clientY, event.timeStamp),
      });

      setDragging(false);
      setOffset(0);

      if (dismiss) onDismiss();
    },
    [onDismiss]
  );

  const cancel = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!active.current) return;
      active.current = false;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* already released */
      }
      reset();
    },
    [reset]
  );

  return {
    offset,
    dragging,
    progress: sheetDragProgress(offset),
    movedRef: moved,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finish,
      onPointerCancel: cancel,
    },
  };
}
