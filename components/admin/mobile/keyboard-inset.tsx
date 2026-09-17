"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * How much of the screen the keyboard is currently covering.
 *
 * iOS Safari does not shrink the layout viewport when the keyboard comes up —
 * it shrinks the *visual* viewport and leaves the page the same height
 * underneath. So a bar pinned to the bottom of the page is pinned to a place
 * that is now behind the keyboard, which is how a save button disappears at
 * the exact moment you have finished typing.
 *
 * `interactiveWidget: "resizes-content"` in the layout's viewport export fixes
 * this where it is supported. This covers the browser this studio is actually
 * used in, and the two compose: when the layout viewport does shrink,
 * innerHeight shrinks with it and the measurement below comes out at zero, so
 * nothing is compensated for twice.
 *
 * There is deliberately only one of these. The measurement is published two
 * ways — as a CSS variable for anything that just needs padding, and as a
 * store for the few components that need to *decide* something — so no part of
 * the studio has to grow a second keyboard detector that disagrees with this
 * one.
 */

/** Below this, the viewport shrank for some reason other than a keyboard. */
const KEYBOARD_THRESHOLD_PX = 120;

/** Pinching to 1.02 is still "not zoomed"; pinching to 1.6 plainly is. */
const ZOOM_TOLERANCE = 0.05;

let inset = 0;
let keyboard = false;
const listeners = new Set<() => void>();

/** Whether what currently has focus is something you can type into. */
function editableFocused(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  // Checkboxes and buttons are inputs and do not summon a keyboard.
  const type = (el as HTMLInputElement).type;
  return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(type);
}

function publish(nextInset: number, nextKeyboard: boolean) {
  if (nextInset === inset && nextKeyboard === keyboard) return;
  inset = nextInset;
  keyboard = nextKeyboard;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pixels of screen the onscreen keyboard is covering. 0 when it is closed. */
export function useKeyboardInset(): number {
  return useSyncExternalStore(
    subscribe,
    () => inset,
    () => 0
  );
}

/**
 * Whether the keyboard is up.
 *
 * Used to get the bottom tab bar out of the way while typing: five navigation
 * targets stacked on a keyboard toolbar is both useless and, on iOS, prone to
 * sitting at the wrong height for a frame or two as the keyboard animates.
 *
 * A shrunken visual viewport is not enough on its own to mean "keyboard".
 * Pinch-zooming shrinks it too, and hiding the navigation because someone
 * zoomed in to look at a photograph would be baffling. So this asks for three
 * things at once: enough of the screen covered, something focused that can
 * actually receive typing, and a viewport that has not been scaled.
 */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => keyboard,
    () => false
  );
}

/** Renders nothing; measures the viewport and publishes the result. */
export function KeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const root = document.documentElement;
    let frame = 0;

    const measure = () => {
      frame = 0;
      // offsetTop matters when the page is scrolled under the keyboard;
      // without it the bar drifts as you scroll a focused field.
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      const next = Math.max(0, Math.round(covered));
      const zoomed = Math.abs(viewport.scale - 1) > ZOOM_TOLERANCE;

      root.style.setProperty("--keyboard-inset", `${next}px`);
      publish(next, next > KEYBOARD_THRESHOLD_PX && !zoomed && editableFocused());
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    // Focus moving between a field and a button changes the answer without
    // changing the viewport by a single pixel.
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);

    return () => {
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      if (frame) cancelAnimationFrame(frame);
      root.style.removeProperty("--keyboard-inset");
      publish(0, false);
    };
  }, []);

  return null;
}
