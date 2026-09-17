"use client";

import { useEffect, useRef, useState } from "react";
import { MobileSheet } from "./mobile-sheet";
import { BlockEditorFields, BLOCK_TYPES } from "./block-editors";
import type { Block } from "@/lib/types";

interface PropertyDrawerProps {
  open: boolean;
  block: Block | null;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
}

/**
 * A block's settings.
 *
 * On a phone this is the same bottom sheet as everything else in the studio —
 * it swipes away, its close control is where the close control always is, and
 * its targets are the size of every other target. It used to be a full-height
 * drawer sliding in from the right with a 24px close button and a 38px Done,
 * which is a desktop panel that had simply never been looked at on a phone.
 *
 * Desktop keeps the drawer. There the extra width genuinely helps — a gallery
 * or an embed has a lot of fields — and a pointer makes a small close button a
 * non-issue.
 *
 * Both render the same <BlockEditorFields>, so there is one set of forms and
 * two ways of presenting it, rather than two implementations to keep in step.
 */
export function PropertyDrawer({ open, block, onChange, onClose }: PropertyDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const [isPointerFine, setIsPointerFine] = useState<boolean | null>(null);

  // Resolved after mount: the server has no idea what it is rendering for, and
  // guessing wrong would mean the sheet and the drawer both flash on screen.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const sync = () => setIsPointerFine(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Close on Escape — the sheet does this itself, the drawer does not.
  useEffect(() => {
    if (!open || isPointerFine === false) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose, isPointerFine]);

  if (!open || !block) return null;

  const label = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type;
  const fields = (
    <BlockEditorFields type={block.type} data={block.data ?? {}} onChange={onChange} />
  );

  // Until the media query has been read, assume the phone. It is the smaller
  // and more constrained of the two, so it is the safer thing to render first.
  if (isPointerFine !== true) {
    return (
      <MobileSheet
        open={open}
        onClose={onClose}
        title={`${label} settings`}
        actions={
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 w-full rounded-md bg-hl text-sm font-semibold text-hl-ink"
          >
            Done
          </button>
        }
      >
        {fields}
      </MobileSheet>
    );
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onPointerDown={onClose}
      />

      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} settings`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-sticky transition-transform duration-base sm:max-w-lg"
      >
        <div className="flex items-center justify-between border-b border-line bg-raise px-5 py-4">
          <span className="rounded bg-pen-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-pen">
            {label} Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-12 min-w-12 items-center justify-center rounded text-faint transition-colors hover:bg-line hover:text-ink"
            aria-label="Close settings"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{fields}</div>

        <div className="flex justify-end border-t border-line bg-raise px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 items-center rounded border border-line bg-surface px-5 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
