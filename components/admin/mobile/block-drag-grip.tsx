"use client";

import type { useDragControls } from "framer-motion";
import { useLongPressDrag } from "./use-long-press-drag";
import { cn } from "@/lib/utils";

/**
 * The one part of a block you are allowed to drag.
 *
 * Making the whole block draggable is the obvious idea and the wrong one. A
 * block contains a textarea you need to put a cursor in, words you need to
 * select, and — above all — most of the vertical space on the screen, which is
 * what your finger lands on when you want to scroll. Motion needs
 * `touch-action: none` on whatever starts a touch drag, and that property
 * switches off the browser's own panning for the region it covers. Applied to
 * a block, it would mean the page stops scrolling wherever there happens to be
 * writing.
 *
 * So drag gets a 48×48 square of its own, and the other ~90% of the block
 * behaves exactly as it did: scroll through it, tap into it, select inside it.
 *
 * Dragging is never the only way. Move up and move down sit in the same
 * toolbar, work without any gesture at all, and are not going anywhere.
 */
export function BlockDragGrip({
  dragControls,
  onLift,
  onCancel,
  disabled,
  className,
}: {
  dragControls: ReturnType<typeof useDragControls>;
  /** Fired once the hold has been honoured, for the lift animation. */
  onLift?: () => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const { holding, bind } = useLongPressDrag({
    disabled,
    onActivate: (event) => {
      onLift?.();
      // No options: this Motion version's start() takes snapToCursor and
      // cursorProgress only. The wobble guard newer versions call
      // distanceThreshold is already covered by the hold's own 8px tolerance —
      // a finger that has drifted that far never reaches this line.
      dragControls.start(event);
    },
    onCancel,
  });

  return (
    <button
      type="button"
      data-drag-handle
      disabled={disabled}
      {...bind}
      aria-label="Hold to move this block"
      title="Hold to move"
      className={cn(
        "flex h-12 w-12 shrink-0 cursor-grab touch-none select-none items-center justify-center",
        "rounded-md transition-[background-color,color,transform] duration-[120ms]",
        "active:cursor-grabbing disabled:opacity-40",
        // The hold is acknowledged before it completes. Without this, 280ms of
        // holding a finger still on a button that does nothing reads as broken.
        holding ? "scale-95 bg-hl-soft text-ink" : "text-faint hover:text-ink",
        className
      )}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <circle cx="9" cy="6" r="1.9" />
        <circle cx="15" cy="6" r="1.9" />
        <circle cx="9" cy="12" r="1.9" />
        <circle cx="15" cy="12" r="1.9" />
        <circle cx="9" cy="18" r="1.9" />
        <circle cx="15" cy="18" r="1.9" />
      </svg>
    </button>
  );
}
