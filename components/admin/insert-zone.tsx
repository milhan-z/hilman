"use client";

import { useState, useRef, useEffect } from "react";
import { BLOCK_TYPES } from "./block-editors";
import { cn } from "@/lib/utils";
import type { BlockType } from "@/lib/types";

interface InsertZoneProps {
  onInsert: (type: BlockType) => void;
}

export function InsertZone({ onInsert }: InsertZoneProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center my-1 group/zone py-2 transition-all duration-fast ${
        isOpen ? "z-40" : "z-10"
      }`}
    >
      {/* Horizontal Line overlay */}
      <div className="absolute inset-x-0 h-px bg-dashed border-t border-line-strong opacity-0 group-hover/zone:opacity-60 transition-opacity pointer-events-none" />

      {/* Insert Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative z-10 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-surface text-faint hover:border-pen hover:text-pen hover:bg-raise shadow-sm transition-all duration-fast hover:scale-110 active:scale-95"
        title="Add block here"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-base ${isOpen ? "rotate-45" : ""}`}
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
      </button>

      {/* Block selector menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 w-72 rounded-lg border border-line bg-surface p-3 shadow-sticky animate-in fade-in slide-in-from-top-2 duration-fast z-50">
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-faint">
            Insert Block
          </p>
          <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto">
            {BLOCK_TYPES.map((t) => (
              <button
                key={t.type}
                type="button"
                onClick={() => {
                  onInsert(t.type);
                  setIsOpen(false);
                }}
                className="flex items-center gap-2 rounded border border-transparent bg-raise px-2 py-1.5 text-left text-xs text-soft hover:border-pen hover:text-pen transition-colors"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-pen-soft text-pen font-mono text-2xs font-bold uppercase">
                  {t.type.slice(0, 2)}
                </span>
                <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Adding a block, on a phone.
 *
 * <InsertZone /> above is a pointer affordance: it appears on hover and opens
 * its own grid of types. Neither half of that works with a finger, so the
 * phone had a full-width dashed "Add block" button at the end of the document
 * instead — which meant every new block was appended and then moved.
 *
 * This is the same gesture the rest of the studio uses: a quiet hairline with
 * a `+` on it, at a real 44px target, handing over to the Add sheet. It reads
 * as a seam in the writing rather than as a control, which is the point — the
 * canvas is meant to look like the document, and an always-visible button per
 * block is how it stopped looking like one.
 */
export function InlineAdd({
  onAdd,
  label = "Add a block here",
  className,
}: {
  onAdd: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={label}
      className={cn(
        "group/add relative flex min-h-11 w-full items-center justify-center",
        className
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 h-px bg-line transition-colors group-active/add:bg-pen"
      />
      <span
        aria-hidden
        className="relative flex h-7 w-7 items-center justify-center rounded-full border border-line bg-paper text-faint transition-colors group-active/add:border-pen group-active/add:text-pen"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </span>
    </button>
  );
}
