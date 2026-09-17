"use client";

import { useEffect, useRef, useState } from "react";
import { useKeyboardInset, useKeyboardOpen } from "./keyboard-inset";
import { cn } from "@/lib/utils";

/**
 * The editor as an app screen rather than a web page.
 *
 * Until now the editor was a long document with a fixed header pinned over it
 * and a sticky bar at the bottom, and the browser's own window did the
 * scrolling. That arrangement is the reason the chrome never felt settled on a
 * phone: iOS rubber-band drags the *document*, and anything participating in
 * the document's layout — including a fixed element whose containing block is
 * the viewport the document is bouncing inside — moves with it. You cannot
 * pin your way out of that; the page itself is the thing in motion.
 *
 * So on a phone the shape is inverted. The shell is `fixed inset-0`: exactly
 * the viewport, out of the document's flow entirely, which leaves the document
 * with nothing to scroll and therefore nothing to bounce. Inside it, three
 * rows — header, canvas, actions — where only the middle one scrolls. Rubber
 * band now belongs to the canvas, and `overscroll-behavior: contain` keeps it
 * from chaining anywhere else.
 *
 *     ┌───────────────┐  fixed inset-0, overflow hidden
 *     │ header        │  shrink-0
 *     ├───────────────┤
 *     │ canvas        │  min-h-0, the only scroller
 *     ├───────────────┤
 *     │ actions       │  shrink-0
 *     └───────────────┘
 *
 * Exactly one scroller. Nesting a second one inside the canvas would bring
 * back every problem this is solving, one level down.
 *
 * Desktop keeps the document. From `lg` up the shell unsets itself back into
 * ordinary flow, because a pointer, a tall window and a sidebar make the
 * constrained version worse rather than better — and because the desktop
 * editor was never the thing that felt wrong.
 */

/** Breathing room between a focused field and the edge it was scrolled from. */
const FOCUS_MARGIN_PX = 12;

export interface MobileEditorShellProps {
  header: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
  /** Receives the scrolling element, for drag auto-scroll. */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function MobileEditorShell({
  header,
  actions,
  children,
  scrollRef,
}: MobileEditorShellProps) {
  const keyboardOpen = useKeyboardOpen();
  const keyboardInset = useKeyboardInset();
  const internalRef = useRef<HTMLDivElement>(null);
  const canvas = scrollRef ?? internalRef;
  const [focusToken, setFocusToken] = useState(0);

  /**
   * While the shell owns the screen, the page behind it must not scroll.
   *
   * `fixed inset-0` already leaves the document with no content to scroll, but
   * the admin layout's own `min-h-[100dvh]` wrapper can still produce a pixel
   * or two of overflow on some viewports — enough for Safari to decide the
   * document is scrollable and start a bounce behind the shell. Saying so
   * explicitly costs one class and removes the ambiguity.
   *
   * The scroll is zeroed first, and that order matters. Hiding overflow while
   * the document is scrolled is exactly the sequence that left
   * `visualViewport.offsetTop` permanently wrong in an earlier version of this
   * studio — the layout viewport can no longer hold the offset, so Safari
   * shifts the visual one instead and never shifts it back. At scroll 0 there
   * is nothing to shift. A client navigation into the editor already lands at
   * the top; this covers the case where something has not.
   */
  useEffect(() => {
    const root = document.documentElement;
    if (window.scrollY !== 0) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
    root.classList.add("studio-editor-shell");
    return () => root.classList.remove("studio-editor-shell");
  }, []);

  /**
   * Keeping the field you are typing in on screen.
   *
   * The browser does this for you when the document is the scroller. Inside a
   * `fixed` shell it stops doing it reliably: iOS shrinks the visual viewport
   * for the keyboard but leaves the layout viewport — and therefore the shell —
   * at full height, so the bottom of the canvas is behind the keyboard and
   * Safari does not consider the field hidden.
   *
   * So the canvas scrolls itself, once, from two numbers it already has: where
   * the field is, and how much of the screen the keyboard covers. That is the
   * whole of the keyboard handling in this component — the previous version
   * spread offsets across an action bar, a sheet and two editors, and every one
   * of them was a guess about a value only <KeyboardInset /> actually measures.
   *
   * It runs on every change to either number, which is also what makes the
   * transition smooth: as the keyboard rises the canvas follows it up, instead
   * of jumping once at the end.
   *
   * Inert on desktop, where the canvas has visible overflow and assigning
   * scrollTop does nothing.
   */
  useEffect(() => {
    const element = canvas.current;
    const focused = document.activeElement as HTMLElement | null;
    if (!element || !focused || !element.contains(focused)) return;

    const box = element.getBoundingClientRect();
    const field = focused.getBoundingClientRect();

    // The canvas ends where the keyboard begins, whichever comes first.
    const visibleBottom = Math.min(box.bottom, window.innerHeight - keyboardInset);
    const below = field.bottom - (visibleBottom - FOCUS_MARGIN_PX);
    const above = box.top + FOCUS_MARGIN_PX - field.top;

    const delta = below > 0 ? below : above > 0 ? -above : 0;
    if (delta === 0) return;
    element.scrollTop += delta;
  }, [canvas, keyboardInset, focusToken]);

  return (
    <div
      className={cn(
        // Phone: the viewport, and nothing else.
        "fixed inset-0 z-20 flex flex-col overflow-hidden bg-paper",
        // Desktop: hand the document back.
        "lg:static lg:z-auto lg:block lg:overflow-visible lg:bg-transparent"
      )}
    >
      <div className="shrink-0 lg:contents">{header}</div>

      <div
        ref={canvas}
        data-editor-canvas
        // Bubbled, not captured per field: every input in the editor would
        // otherwise need to know about the keyboard, which is the arrangement
        // this replaces.
        onFocus={() => setFocusToken((token) => token + 1)}
        className={cn(
          // min-h-0 is what lets a flex child actually shrink and scroll
          // instead of growing the container past the viewport.
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          "px-4 pb-6 pt-4",
          "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
          "lg:overflow-visible lg:px-0 lg:pt-0"
        )}
        style={{
          // Room to scroll the focused field clear of the keyboard. Safari does
          // not honour interactive-widget, so the canvas still extends under
          // the keyboard there; this gives it somewhere to go. Added to pb-6
          // rather than replacing it — an inline padding-bottom would otherwise
          // drop the last block's breathing room at the moment you start
          // typing in it.
          paddingBottom: keyboardOpen
            ? "calc(1.5rem + var(--keyboard-inset, 0px))"
            : undefined,
        }}
      >
        {children}
      </div>

      {/* Out of the way entirely while typing — see the action bar's own note.
          `hidden` rather than a height animation: animating the row height of
          a grid while the keyboard is also animating produces two transitions
          fighting over the same pixels. */}
      <div
        className={cn(
          "shrink-0 lg:contents",
          // `lg:contents` twice rather than `lg:block`: both would be a
          // display on the same element at `lg`, and which one won would be
          // decided by Tailwind's output order rather than by anything written
          // here. Repeating the desktop value makes the answer the same either
          // way.
          keyboardOpen && "hidden lg:contents"
        )}
      >
        {actions}
      </div>
    </div>
  );
}
