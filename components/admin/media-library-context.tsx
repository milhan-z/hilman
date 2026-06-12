"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { MediaSelectorModal } from "./media-selector-modal";

interface MediaSelectorContextType {
  openSelector: (onSelect: (publicId: string, altText?: string) => void) => void;
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
  const [selectCallback, setSelectCallback] = useState<((publicId: string, altText?: string) => void) | null>(null);

  function openSelector(onSelect: (publicId: string, altText?: string) => void) {
    setSelectCallback(() => onSelect);
    setIsOpen(true);
  }

  function closeSelector() {
    setIsOpen(false);
    setSelectCallback(null);
  }

  function handleSelect(publicId: string, altText?: string) {
    if (selectCallback) {
      selectCallback(publicId, altText);
    }
    closeSelector();
  }

  return (
    <MediaSelectorContext.Provider value={{ openSelector, closeSelector }}>
      {children}
      <MediaSelectorModal
        isOpen={isOpen}
        onClose={closeSelector}
        onSelect={handleSelect}
      />
    </MediaSelectorContext.Provider>
  );
}
