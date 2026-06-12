"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { quickUpdateItem } from "@/app/admin/actions";
import { Field, Select, TextInput, CheckRow } from "./fields";
import { STREAMS } from "@/lib/types";

interface QuickEditModalProps {
  isOpen: boolean;
  kind: "project" | "journal";
  item: {
    id: string;
    title: string;
    slug: string;
    status: "published" | "draft";
    featured: boolean;
    stream?: string;
    year?: number | null;
    sort_order?: number;
  } | null;
  onClose: () => void;
}

export function QuickEditModal({ isOpen, kind, item, onClose }: QuickEditModalProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"published" | "draft">("draft");
  const [featured, setFeatured] = useState(false);
  const [stream, setStream] = useState("visual-design");
  const [year, setYear] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<number>(0);

  const isProject = kind === "project";

  // Sync form state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || "");
      setSlug(item.slug || "");
      setStatus(item.status || "draft");
      setFeatured(item.featured || false);
      if (item.stream) setStream(item.stream);
      setYear(item.year !== undefined && item.year !== null ? String(item.year) : "");
      setSortOrder(item.sort_order ?? 0);
      setError(null);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const yearNum = year.trim() !== "" ? Number(year) : null;

    try {
      const res = await quickUpdateItem(kind, item!.id, {
        title,
        slug,
        status,
        featured,
        stream,
        year: yearNum,
        sort_order: sortOrder,
      });

      if (res.status === "error") {
        setError(res.message || "Failed to update item.");
      } else {
        router.refresh();
        onClose();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-6 shadow-sticky animate-in fade-in zoom-in-95 duration-fast">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <h3 className="font-display text-base font-bold text-ink">
            Quick Edit: <span className="font-hand font-normal text-faint">{item.title}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-faint hover:bg-line hover:text-ink transition-colors"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Title">
            <TextInput
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="text-sm py-2"
            />
          </Field>

          <Field label="Slug">
            <TextInput
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="text-sm py-2"
            />
          </Field>

          {isProject && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stream">
                <Select
                  value={stream}
                  onChange={(e) => setStream(e.target.value)}
                  className="text-sm py-2"
                >
                  {Object.entries(STREAMS).map(([key, s]) => (
                    <option key={key} value={key}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Year">
                <TextInput
                  type="number"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="text-sm py-2"
                />
              </Field>
            </div>
          )}

          {isProject && (
            <Field label="Sort Order">
              <TextInput
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                className="text-sm py-2"
              />
            </Field>
          )}

          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-line">
            <div className="flex items-center gap-4">
              <Field label="Status">
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "published" | "draft")}
                  className="text-xs py-1.5 min-h-0 w-28"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </Select>
              </Field>
              <div className="mt-5">
                <CheckRow
                  label="Featured"
                  checked={featured}
                  onChange={(e) => setFeatured(e.target.checked)}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs font-medium text-red">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[38px] items-center rounded border border-line bg-surface px-4 text-xs font-semibold text-soft hover:bg-line hover:text-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[38px] items-center rounded bg-hl px-4 text-xs font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Updating..." : "Update"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
