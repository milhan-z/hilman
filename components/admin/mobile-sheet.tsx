"use client";

import { useEffect, useRef } from "react";
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
}

export function MobileSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  actions,
}: MobileSheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col outline-none",
          "rounded-t-xl border-t border-line-strong bg-surface shadow-sticky",
          "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-md",
          "sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:border"
        )}
      >
        <div className="shrink-0 px-4 pt-2.5 sm:px-6 sm:pt-5">
          {/* A grab handle that is also a real button — dragging is a gesture,
              and a gesture is never the only way to do something here. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            className="mx-auto mb-2 flex min-h-11 w-20 items-center justify-center sm:hidden"
          >
            <span aria-hidden className="h-1 w-12 rounded-full bg-line-strong" />
          </button>

          <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
            <div className="min-w-0">
              <h2 className="font-display text-base font-bold text-ink">{title}</h2>
              {subtitle && (
                <p className="truncate font-hand text-base text-faint">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title.toLowerCase()}`}
              className="-mr-2 hidden min-h-11 min-w-11 items-center justify-center rounded text-faint transition-colors hover:text-ink sm:flex"
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
          <div className="shrink-0 border-t border-line bg-surface/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
            {actions}
          </div>
        )}
      </div>
    </div>
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
