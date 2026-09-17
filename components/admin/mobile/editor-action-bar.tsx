"use client";

import type { EditorAction, EditorStatus } from "@/lib/studio-editor-state";
import { StatusLine } from "./status-line";
import { cn } from "@/lib/utils";

/**
 * The bottom of an editor screen.
 *
 * On a phone this replaces the tab bar rather than sitting above it: inside a
 * document, the thumb's home position belongs to that document. What it offers
 * is decided entirely by describeEditor(), so the buttons and the sentence
 * above them can never disagree — the old bar had a single "Save changes" and
 * a status dropdown hidden three sections up the page, which is how "did I
 * just publish that?" became a question worth redesigning the studio over.
 *
 * It does not position itself on a phone. It used to be `sticky` with
 * `bottom: var(--keyboard-inset)`, which is two workarounds stacked: sticky to
 * survive a scrolling document, and a measured keyboard offset to survive the
 * keyboard covering it. Both were symptoms of living inside the scroller. It
 * is now a row of <MobileEditorShell />, which is outside the scroller and
 * above the keyboard by construction — and the shell takes the row out
 * entirely while typing, so there is no offset left to compute.
 */

export interface EditorActionBarProps {
  status: EditorStatus;
  onAction: (action: EditorAction) => void;
  /** Disables both buttons and says why — a missing title, mostly. */
  blockedReason?: string | null;
  /** Rendered on the right of the status row: preview links, the ••• menu. */
  trailing?: React.ReactNode;
  /** Shown when there is nothing to save, in place of the buttons. */
  idleActions?: React.ReactNode;
}

export function EditorActionBar({
  status,
  onAction,
  blockedReason,
  trailing,
  idleActions,
}: EditorActionBarProps) {
  const actions = [status.secondary, status.primary].filter(Boolean) as EditorAction[];
  const busy = status.state === "SAVING_DRAFT" || status.state === "PUBLISHING";

  return (
    <div
      className={cn(
        "border-t border-line bg-paper backdrop-blur",
        "px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        "shadow-sticky",
        // Desktop is still a document, so the bar still has to stick to the
        // bottom of it and bleed to the gutters <main> sets.
        "lg:sticky lg:bottom-0 lg:z-30 lg:-mx-8 lg:px-8"
      )}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-2">
        <div className="flex min-h-6 items-center justify-between gap-3">
          <StatusLine tone={blockedReason ? "bad" : status.tone}>
            {blockedReason ?? status.statusLine}
          </StatusLine>
          {trailing}
        </div>

        {status.note && !blockedReason && (
          <p className="text-xs leading-snug text-faint">{status.note}</p>
        )}

        {actions.length > 0 ? (
          <div className={cn("grid gap-2", actions.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={busy || Boolean(blockedReason)}
                onClick={() => onAction(action)}
                className={cn(
                  "min-h-[52px] rounded-md px-4 text-sm font-semibold",
                  // Colour and scale, 120ms: the button has to look pressed in
                  // the same frame as the finger, not after a transition.
                  "transition-[opacity,transform] duration-[120ms]",
                  "active:scale-[0.98] active:opacity-90 disabled:opacity-50",
                  action.emphasis === "accent"
                    ? "bg-hl text-hl-ink shadow-card"
                    : "border border-line-strong bg-surface text-ink"
                )}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : (
          idleActions
        )}
      </div>
    </div>
  );
}
