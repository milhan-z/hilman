"use client";

import { useEffect, useState } from "react";
import { MobileSheet } from "../mobile-sheet";
import { BLOCK_TYPES } from "../block-editors";
import { cn } from "@/lib/utils";
import type { BlockType } from "@/lib/types";

/**
 * Add something to a page.
 *
 * This used to be the contents of the block registry, in registry order:
 * fourteen equal rows beginning "Heading, Paragraph, Markdown". That is the
 * database's view of the world. Someone adding to a case study on their phone
 * wants a photo or a sentence, and wants it without reading a list.
 *
 * So the handful of things that actually get used are large targets at the top, and
 * everything else — embeds, code, files, experiments — is behind one more tap.
 * The list underneath is still generated from BLOCK_TYPES, so a new block type
 * appears there automatically and nothing has to be kept in step by hand.
 *
 * Photo and Gallery do not insert an empty block and leave you looking at a
 * placeholder. They ask for the picture first, which is the thing you came to
 * do; the block is created around what you chose.
 */

/** The ones that earn a tile, in the order they get reached for. */
const COMMON: { type: BlockType; label: string; hint: string; icon: React.ReactNode }[] = [
  {
    type: "image",
    label: "Photo",
    hint: "Camera or library",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </>
    ),
  },
  {
    type: "paragraph",
    label: "Text",
    hint: "Start typing",
    icon: (
      <>
        <path d="M4 7V5h16v2" />
        <path d="M12 5v14" />
        <path d="M9 19h6" />
      </>
    ),
  },
  {
    type: "heading",
    label: "Heading",
    hint: "A section title",
    icon: (
      <>
        <path d="M6 4v16M18 4v16M6 12h12" />
      </>
    ),
  },
  {
    type: "gallery",
    label: "Gallery",
    hint: "Several photos",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </>
    ),
  },
  {
    type: "youtube",
    label: "Video",
    hint: "Paste a link",
    icon: (
      <>
        <path d="M23 7a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V7z" />
        <polygon points="10 11 10 15 14 13" />
      </>
    ),
  },
  {
    type: "loop-clip",
    label: "Loop Clip",
    hint: "A short, silent, looping video",
    icon: (
      <>
        <polyline points="17 1 21 5 17 9" />
        <path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" />
        <path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </>
    ),
  },
];

/** Plainer words for the long list, where the registry's own names show. */
const PLAIN_NAME: Partial<Record<BlockType, string>> = {
  paragraph: "Text",
  image: "Photo",
  youtube: "Video",
  link: "Link card",
  custom: "Experiment",
};

const COMMON_TYPES = new Set(COMMON.map((entry) => entry.type));

export function AddBlockSheet({
  open,
  onClose,
  onInsert,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onInsert: (type: BlockType) => void;
  /** Hands over to the template/import sheet. */
  onImport?: () => void;
}) {
  const [showAll, setShowAll] = useState(false);

  // Reopening should always land on the short list.
  useEffect(() => {
    if (open) setShowAll(false);
  }, [open]);

  const choose = (type: BlockType) => {
    onInsert(type);
    onClose();
  };

  return (
    <MobileSheet open={open} onClose={onClose} title="Add something">
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-2.5">
          {COMMON.map((entry) => (
            <li key={entry.type}>
              <button
                type="button"
                onClick={() => choose(entry.type)}
                className={cn(
                  "flex min-h-[72px] w-full items-center gap-3 rounded-lg border px-3.5 text-left",
                  "border-line bg-raise transition-colors hover:border-pen active:bg-card-hover"
                )}
              >
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-hl-soft text-ink"
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {entry.icon}
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{entry.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-faint">{entry.hint}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {onImport && (
          <button
            type="button"
            onClick={() => {
              onClose();
              onImport();
            }}
            className="flex min-h-12 w-full items-center justify-between rounded-md border border-line px-3.5 text-left text-sm font-medium text-soft transition-colors hover:text-ink active:bg-card-hover"
          >
            <span>
              Template or import
              <span className="mt-0.5 block text-xs font-normal text-faint">
                Start from a structure, or paste one in
              </span>
            </span>
            <span aria-hidden>›</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowAll((open) => !open)}
          aria-expanded={showAll}
          className="flex min-h-12 w-full items-center justify-between rounded-md border border-line px-3.5 text-sm font-medium text-soft transition-colors hover:text-ink"
        >
          More blocks
          <span aria-hidden className={showAll ? "rotate-180 transition-transform" : "transition-transform"}>
            ⌄
          </span>
        </button>

        {showAll && (
          <ul className="space-y-1.5">
            {BLOCK_TYPES.filter((block) => !COMMON_TYPES.has(block.type)).map((block) => (
              <li key={block.type}>
                <button
                  type="button"
                  onClick={() => choose(block.type)}
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
        )}
      </div>
    </MobileSheet>
  );
}
