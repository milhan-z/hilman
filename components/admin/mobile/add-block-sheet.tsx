"use client";

import { MobileSheet } from "../mobile-sheet";
import { BLOCK_TYPES } from "../block-editors";
import type { BlockType } from "@/lib/types";

/**
 * Add a block, with your thumb.
 *
 * The desktop insert control is a 28px circle that appears on hover, opening a
 * 72px-wide popover of 24px targets — three separate things a touch screen
 * cannot do. Same fourteen block types, same order, as a full-width sheet.
 *
 * The plainer names are on purpose: "Text" and "Photo" are what you are adding,
 * "paragraph" and "image" are what the database calls them.
 */

const PLAIN_NAME: Partial<Record<BlockType, string>> = {
  paragraph: "Text",
  image: "Photo",
  youtube: "Video",
  link: "Link card",
  custom: "Experiment",
};

export function AddBlockSheet({
  open,
  onClose,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (type: BlockType) => void;
}) {
  return (
    <MobileSheet open={open} onClose={onClose} title="Add block">
      <ul className="space-y-1.5">
        {BLOCK_TYPES.map((block) => (
          <li key={block.type}>
            <button
              type="button"
              onClick={() => {
                onInsert(block.type);
                onClose();
              }}
              className="flex min-h-12 w-full items-center gap-3 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen"
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-pen-soft font-mono text-2xs font-bold uppercase text-pen"
              >
                {block.type.slice(0, 2)}
              </span>
              <span className="text-sm font-medium text-ink">
                {PLAIN_NAME[block.type] ?? block.label}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </MobileSheet>
  );
}
