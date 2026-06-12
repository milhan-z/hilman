"use client";

import { useState, useEffect } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { mediaSrc } from "@/lib/cloudinary";
import type { MediaRow } from "@/lib/types";

interface MediaSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (publicId: string, altText?: string) => void;
}

export function MediaSelectorModal({ isOpen, onClose, onSelect }: MediaSelectorModalProps) {
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [folderFilter, setFolderFilter] = useState("all");
  const [selectedItem, setSelectedItem] = useState<MediaRow | null>(null);

  // Fetch media from Supabase when the modal is opened
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedItem(null);
      const sb = createPublicClient();

      sb.from("media")
        .select("*")
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) {
            setMedia(data as MediaRow[]);
          }
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter items
  const folders = Array.from(new Set(media.map((m) => m.folder).filter(Boolean))) as string[];

  const filteredMedia = media.filter((item) => {
    const matchesSearch =
      item.public_id.toLowerCase().includes(search.toLowerCase()) ||
      (item.alt || "").toLowerCase().includes(search.toLowerCase()) ||
      (item.title || "").toLowerCase().includes(search.toLowerCase());

    const matchesFolder = folderFilter === "all" || item.folder === folderFilter;

    return matchesSearch && matchesFolder;
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 flex h-[80vh] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface shadow-sticky animate-in fade-in zoom-in-95 duration-fast">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line bg-raise px-5 py-4">
          <div>
            <h3 className="font-display text-base font-bold text-ink">Choose Media</h3>
            <p className="text-xs text-faint mt-0.5">Select an existing asset from the library</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-line hover:text-ink transition-colors"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-raise/50 p-4">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search by file ID, title, or alt text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded border border-line bg-raise px-3 py-1.5 text-xs text-ink outline-none focus:border-pen"
            />
          </div>

          {folders.length > 0 && (
            <div className="w-44">
              <select
                aria-label="Filter by folder"
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                className="w-full rounded border border-line bg-raise px-3 py-1.5 text-xs text-ink outline-none focus:border-pen"
              >
                <option value="all">All Folders</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Grid Media Display */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-soft animate-pulse">Loading library assets...</p>
            </div>
          ) : filteredMedia.length === 0 ? (
            <div className="flex h-full items-center justify-center italic text-faint">
              No media assets found matching filters.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
              {filteredMedia.map((item) => {
                const isSelected = selectedItem?.id === item.id;
                const src = item.kind === "image" ? mediaSrc(item.public_id, { width: 150 }) : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className={`relative aspect-square cursor-pointer overflow-hidden rounded-lg border transition-all ${
                      isSelected
                        ? "border-pen ring-2 ring-pen/30 scale-98 bg-raise"
                        : "border-line bg-surface hover:border-line-strong hover:scale-102"
                    }`}
                  >
                    {src ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={src}
                        alt={item.alt || item.public_id}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xl bg-n-100">📄</div>
                    )}
                    {isSelected && (
                      <div className="absolute right-1 top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-hl text-hl-ink shadow-card">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t border-line bg-raise px-5 py-3.5">
          <div className="text-xs text-soft truncate max-w-md">
            {selectedItem ? (
              <span className="font-mono text-pen font-medium">Selected: {selectedItem.public_id}</span>
            ) : (
              <span className="italic text-faint">Choose an asset to proceed</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[38px] items-center rounded border border-line bg-surface px-4 text-xs font-semibold text-soft hover:bg-line hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!selectedItem}
              onClick={() => onSelect(selectedItem!.public_id, selectedItem!.alt || undefined)}
              className="inline-flex min-h-[38px] items-center rounded bg-hl px-5 text-xs font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Insert Asset
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
