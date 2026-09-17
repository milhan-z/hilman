"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LONG_PRESS_MS,
  LONG_PRESS_TOLERANCE_PX,
  distanceBetween,
  longPressCancelled,
} from "@/lib/studio-gestures";

/**
 * Deciding whether a finger on a grip means "pick this up".
 *
 * This hook answers that one question and then gets out of the way — the
 * actual reordering is Framer Motion's, which the studio already uses for the
 * block list. Separating them keeps the timing logic testable and means Motion
 * is still the only thing that knows how to move a list around.
 *
 * A mouse skips all of it. Pointing at a grip with a cursor and pressing the
 * button is already unambiguous; making a desktop user hold still for a third
 * of a second would be a tax on precision they already have.
 *
 * A finger has to wait, because on a touch screen the same gesture starts a
 * drag and a scroll, and the only thing that distinguishes them in the first
 * moments is whether the finger stays put. So: hold still and it lifts, move
 * and the intent is abandoned, lift early and nothing happened at all.
 */

export interface LongPressDragOptions {
  /** Hand the original pointer event to Motion's dragControls.start(). */
  onActivate: (event: React.PointerEvent<HTMLElement>) => void;
  /** The hold was abandoned — reset any "about to lift" styling. */
  onCancel?: () => void;
  delay?: number;
  tolerance?: number;
  disabled?: boolean;
}

export interface LongPressDragState {
  /** True from pointerdown until the hold resolves — used to show it pressing. */
  holding: boolean;
  bind: {
    onPointerDown: React.PointerEventHandler<HTMLElement>;
    onPointerMove: React.PointerEventHandler<HTMLElement>;
    onPointerUp: React.PointerEventHandler<HTMLElement>;
    onPointerCancel: React.PointerEventHandler<HTMLElement>;
    onContextMenu: React.MouseEventHandler<HTMLElement>;
  };
}

export function useLongPressDrag({
  onActivate,
  onCancel,
  delay = LONG_PRESS_MS,
  tolerance = LONG_PRESS_TOLERANCE_PX,
  disabled = false,
}: LongPressDragOptions): LongPressDragState {
  const [holding, setHolding] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const pending = useRef<React.PointerEvent<HTMLElement> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
    pending.current = null;
    setHolding(false);
  }, []);

  // A hold interrupted by unmounting must not fire into a dead component.
  useEffect(() => clear, [clear]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (disabled || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (event.pointerType === "mouse") {
        onActivate(event);
        return;
      }

      // React pools nothing in 19, but the event is still only valid for this
      // tick's synchronous work; persisting the object is what lets the timer
      // hand Motion the position the finger actually landed on.
      pending.current = event;
      origin.current = { x: event.clientX, y: event.clientY };
      setHolding(true);

      timer.current = setTimeout(() => {
        timer.current = null;
        const started = pending.current;
        pending.current = null;
        setHolding(false);
        if (started) onActivate(started);
      }, delay);
    },
    [delay, disabled, onActivate]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const start = origin.current;
      if (!start || timer.current === null) return;

      const distance = distanceBetween(start, { x: event.clientX, y: event.clientY });
      if (!longPressCancelled({ distance, tolerance })) return;

      // The finger is going somewhere. This was a scroll, or a mis-grab.
      clear();
      onCancel?.();
    },
    [clear, onCancel, tolerance]
  );

  const release = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      // Already lifted: the timer fired and Motion owns the pointer now.
      if (timer.current === null && origin.current === null) return;
      void event;
      clear();
      onCancel?.();
    },
    [clear, onCancel]
  );

  return {
    holding,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: release,
      onPointerCancel: release,
      // Holding still on a touch screen is also how iOS is asked for a context
      // menu. Suppressed on the grip alone — the rest of the editor keeps the
      // system menu, including copy and paste inside the text you are editing.
      onContextMenu: (event) => event.preventDefault(),
    },
  };
}
