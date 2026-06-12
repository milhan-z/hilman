"use client";

import { useEffect, useRef } from "react";
import { BlockEditorFields, BLOCK_TYPES } from "./block-editors";
import type { Block } from "@/lib/types";

interface PropertyDrawerProps {
  open: boolean;
  block: Block | null;
  onChange: (data: Record<string, any>) => void;
  onClose: () => void;
}

export function PropertyDrawer({ open, block, onChange, onClose }: PropertyDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open || !block) return null;

  const label = BLOCK_TYPES.find((t) => t.type === block.type)?.label ?? block.type;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <div
        ref={drawerRef}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-surface shadow-sticky transition-transform duration-base sm:max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-raise px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded bg-pen-soft px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-pen">
              {label} Settings
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-line hover:text-ink transition-colors"
            aria-label="Close drawer"
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
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-5">
          <BlockEditorFields
            type={block.type}
            data={block.data ?? {}}
            onChange={onChange}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-line bg-raise px-5 py-3.5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[38px] items-center rounded border border-line bg-surface px-5 text-sm font-medium text-soft hover:border-pen hover:text-pen transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
