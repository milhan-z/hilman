"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSwipeDismiss } from "./mobile/use-swipe-dismiss";
import { useScrollLock } from "./mobile/use-scroll-lock";
import { cn } from "@/lib/utils";

/**
 * A panel that comes up from the bottom edge.
 *
 * Centred dialogs are a desktop habit. On a phone held in one hand, the middle
 * of the screen is the hardest place to reach and the top is unreachable; the
 * bottom is where the thumb already is. So the sheet is anchored there, its
 * actions sit at the bottom of the sheet, and it stays a plain centred dialog
 * from `sm` up where a pointer makes the difference moot.
 *
 * Sizes are in dvh, not vh: Safari's toolbar changes the viewport height as
 * you scroll, and a sheet measured in vh has its buttons under the toolbar
 * exactly when you reach for them.
 *
 * The handle at the top is a real drag target: pull it down and the sheet
 * follows your finger; let go past roughly a thumb's travel — or flick it —
 * and it goes away. Only the handle does this. The body of a sheet scrolls,
 * and a gesture that means two different things a pixel apart is not a gesture
 * anyone can aim.
 *
 * Every sheet in the studio is this component, so the gesture is written once
 * and Add block, Details, More, Quick note, block settings and the media
 * picker all inherit it.
 *
 * ── why it is portalled ──
 *
 * The sheet is `position: fixed`, which normally means "the viewport". It does
 * not mean that inside an ancestor with a `transform`, a `filter` or a
 * `backdrop-filter`: any of those makes the ancestor a containing block, and a
 * fixed child then resolves against *it*.
 *
 * That is not hypothetical. <SyncIndicator /> is mounted in the mobile header,
 * which carries `backdrop-blur`, so this sheet resolved against a 60px-tall
 * bar — the whole thing, backdrop and panel and buttons, squeezed into a strip
 * across the top of the screen. From the phone it looked like a yellow
 * "Nothing to send" banner stuck above the app. Nothing was stuck: the sheet
 * was simply being laid out inside its own header.
 *
 * Rendering into <body> removes the class of bug rather than the instance. No
 * caller has to know which of its ancestors happens to blur something today,
 * and none of them has to keep knowing tomorrow.
 */

export interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title — the name of the thing being edited. */
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned to the bottom of the sheet, above the home indicator. */
  actions?: React.ReactNode;
  labelledBy?: string;
  /** Wider than the default for grids — the media picker uses it. */
  size?: "default" | "wide";
}

export function MobileSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
  size = "default",
}: MobileSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const swipe = useSwipeDismiss({ onDismiss: onClose });
  // Holds the page still without shifting the visual viewport. See the hook.
  useScrollLock(open);

  /* Whichever onClose is current when Escape is pressed.
     It used to be a dependency of the effect below, and callers pass a fresh
     arrow on every render — the editor re-renders on every keystroke. So each
     letter typed into a sheet re-ran the effect: focus went back to where it
     came from, then to the panel, and on a phone the keyboard closed after
     one character. The effect is about the sheet opening, and nothing else. */
  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;

      // Keep Tab inside the sheet: behind it is a whole page of controls that
      // are visually covered and, for a screen reader, inert.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // preventScroll: returning focus to the control that opened the sheet
      // otherwise scrolls it into view, which on a phone means the page moves
      // by itself the moment a sheet is dismissed.
      restoreFocus.current?.focus?.({ preventScroll: true });
    };
  }, [open]);

  // Portals need a DOM to render into, and the server has none. Mounting is
  // tracked rather than assumed so the first client render matches the HTML.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm"
      // Pointer, not mouse: a tap on the backdrop of a touch device never
      // produced a mousedown here, so dismissing by tapping outside the sheet
      // silently did not work on the one device this studio is used on.
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
      style={{ opacity: 1 - swipe.progress * 0.6 }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-mobile-sheet
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col outline-none",
          "rounded-t-xl border-t border-line-strong bg-surface shadow-sticky",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full",
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border",
          size === "wide" ? "sm:max-w-2xl" : "sm:max-w-md"
        )}
        style={{
          // translate3d, not `top`: the compositor moves this without asking
          // the layout engine anything, which is what keeps a finger-tracking
          // drag smooth. The transition is off mid-drag so the sheet sits
          // exactly under the finger, and back on at release so it springs.
          transform: swipe.offset ? `translate3d(0, ${swipe.offset}px, 0)` : undefined,
          transition: swipe.dragging
            ? "none"
            : "transform 180ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="shrink-0 px-4 pt-1 sm:px-6 sm:pt-5">
          {/* Grab handle and close button in one. Dragging is a gesture, and a
              gesture is never the only way to do something here — this is a
              real button, so a tap and the Enter key both close the sheet. */}
          <button
            type="button"
            data-sheet-handle
            onClick={() => {
              // The pointerup that ends a drag is followed by a click. A
              // dismissing drag has already closed the sheet; a snap-back must
              // not close it as a side effect of having been touched at all.
              if (swipe.movedRef.current) {
                swipe.movedRef.current = false;
                return;
              }
              onClose();
            }}
            {...swipe.handleProps}
            aria-label={`Close ${title.toLowerCase()}`}
            className="mx-auto mb-1 flex min-h-12 w-24 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing sm:hidden"
          >
            <span aria-hidden className="h-1 w-12 rounded-full bg-line-strong" />
          </button>

          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div className="min-w-0 pt-1.5">
              <h2 className="font-display text-base font-bold text-ink">{title}</h2>
              {subtitle && (
                <p className="truncate font-hand text-base text-faint">{subtitle}</p>
              )}
            </div>
            {/* Shown at every width now. The handle is reachable and closes on
                tap, but a cross is the control people look for. */}
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()}`}
              className="-mr-2 flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-ink"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {children}
        </div>

        {actions && (
          <div
            className="shrink-0 border-t border-line bg-surface px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
            // The sheet's own actions have to clear the keyboard too: a Quick
            // note's Save button is directly under the field you are typing in.
            style={{ marginBottom: "var(--keyboard-inset, 0px)" }}
          >
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

/** The two-up action row a sheet almost always ends with. */
export function SheetActions({
  cancelLabel = "Cancel",
  onCancel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
  form,
}: {
  cancelLabel?: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm?: () => void;
  confirmDisabled?: boolean;
  /** Id of the form to submit, when the confirm button is a submit button. */
  form?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-12 rounded-md border border-line-strong bg-surface px-4 text-sm font-semibold text-soft transition-colors hover:text-ink"
      >
        {cancelLabel}
      </button>
      <button
        type={form ? "submit" : "button"}
        form={form}
        onClick={onConfirm}
        disabled={confirmDisabled}
        className="min-h-12 rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
