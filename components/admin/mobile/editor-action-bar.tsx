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
        "sticky z-30 -mx-4 border-t border-line bg-paper/95 backdrop-blur",
        "px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        "shadow-sticky sm:-mx-8 sm:px-8"
      )}
      // Rides above the keyboard instead of under it — see <KeyboardInset />.
      style={{ bottom: "var(--keyboard-inset, 0px)" }}
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
                  "min-h-[52px] rounded-md px-4 text-sm font-semibold transition-opacity",
                  "active:opacity-80 disabled:opacity-50",
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
