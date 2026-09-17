"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { MediaSelectorModal } from "./media-selector-modal";
import { MediaPickerSheet } from "./mobile/media-picker-sheet";

/**
 * One way to ask for a picture, two ways of answering.
 *
 * Every field that wants media calls `openSelector` and gets back a reference
 * — either a `pending:` placeholder for something taken just now, or a stored
 * id for something already in the library. What it does *not* get is a say in
 * how the choosing happened, which is what lets a phone use a bottom sheet and
 * a laptop keep the wide grid without either component knowing about the other.
 */

export interface MediaPick {
  ref: string;
  alt?: string;
}

interface MediaSelectorOptions {
  /** Gallery blocks want several at once. */
  multiple?: boolean;
  title?: string;
}

interface MediaSelectorContextType {
  openSelector: (
    onSelect: (publicId: string, altText?: string) => void,
    options?: MediaSelectorOptions
  ) => void;
  /** Gallery insertion — receives everything chosen in one call. */
  openMultiSelector: (onSelect: (picks: MediaPick[]) => void, title?: string) => void;
  closeSelector: () => void;
}

const MediaSelectorContext = createContext<MediaSelectorContextType | undefined>(undefined);

export function useMediaSelector() {
  const context = useContext(MediaSelectorContext);
  if (!context) {
    throw new Error("useMediaSelector must be used within a MediaSelectorProvider");
  }
  return context;
}

export function MediaSelectorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [multiple, setMultiple] = useState(false);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [handler, setHandler] = useState<((picks: MediaPick[]) => void) | null>(null);

  // Which presentation to use. Resolved after mount and kept in step with the
  // window, so rotating a tablet does not strand the picker in the wrong shape.
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px) and (pointer: fine)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const closeSelector = useCallback(() => {
    setIsOpen(false);
    setHandler(null);
    setMultiple(false);
    setTitle(undefined);
  }, []);

  const openSelector = useCallback(
    (onSelect: (publicId: string, altText?: string) => void, options?: MediaSelectorOptions) => {
      setHandler(() => (picks: MediaPick[]) => {
        const first = picks[0];
        if (first) onSelect(first.ref, first.alt);
      });
      setMultiple(Boolean(options?.multiple));
      setTitle(options?.title);
      setIsOpen(true);
    },
    []
  );

  const openMultiSelector = useCallback(
    (onSelect: (picks: MediaPick[]) => void, sheetTitle?: string) => {
      setHandler(() => onSelect);
      setMultiple(true);
      setTitle(sheetTitle);
      setIsOpen(true);
    },
    []
  );

  const handlePick = useCallback(
    (picks: MediaPick[]) => {
      handler?.(picks);
      closeSelector();
    },
    [handler, closeSelector]
  );

  return (
    <MediaSelectorContext.Provider value={{ openSelector, openMultiSelector, closeSelector }}>
      {children}

      {/* Until the query has been read, assume the phone: it is the smaller and
          more constrained of the two, so it is the safer thing to render.

          Choosing several at once always uses the sheet, at any width. The
          desktop modal only ever returns one asset, and a gallery built one
          round-trip at a time is the workflow this replaced. */}
      {wide && !multiple ? (
        <MediaSelectorModal
          isOpen={isOpen}
          onClose={closeSelector}
          onSelect={(publicId, altText) => handlePick([{ ref: publicId, alt: altText }])}
        />
      ) : (
        <MediaPickerSheet
          open={isOpen}
          onClose={closeSelector}
          onPick={handlePick}
          multiple={multiple}
          {...(title ? { title } : {})}
        />
      )}
    </MediaSelectorContext.Provider>
  );
}

/**
 * Opens the shared media picker and hands the chosen reference back.
 * Lives here so any form field can reuse the library instead of asking the
 * editor to remember a Cloudinary id.
 */
export function MediaSelectorButton({
  onSelect,
  label = "Choose from library",
}: {
  onSelect: (publicId: string, altText?: string) => void;
  label?: string;
}) {
  const { openSelector } = useMediaSelector();
  return (
    <button
      type="button"
      onClick={() => openSelector(onSelect)}
      className="min-h-12 shrink-0 rounded border border-line-strong px-3.5 text-sm text-soft transition-colors hover:border-pen hover:text-pen"
    >
      {label}
    </button>
  );
}
