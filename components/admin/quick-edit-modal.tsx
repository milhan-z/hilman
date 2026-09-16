"use client";

import { useId, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { quickUpdateItem } from "@/app/admin/actions";
import { Field, Select, TextInput, CheckRow } from "./fields";
import { MobileSheet, SheetActions } from "./mobile-sheet";
import { STREAMS } from "@/lib/types";

/**
 * Change the few things you change most — title, slug, status — without
 * opening the whole editor.
 *
 * It used to be a 400px box pinned to the middle of the screen with 38px
 * buttons, which is a desktop dialog wearing a phone's clothes. It is a bottom
 * sheet now: full width where the thumb is, 48px actions, and the rarely-used
 * fields folded away so the common case is two taps.
 */

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
  const formId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<"published" | "draft">("draft");
  const [featured, setFeatured] = useState(false);
  const [stream, setStream] = useState("visual-design");
  const [year, setYear] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<number>(0);

  const isProject = kind === "project";

  useEffect(() => {
    if (!item) return;
    setTitle(item.title || "");
    setSlug(item.slug || "");
    setStatus(item.status || "draft");
    setFeatured(item.featured || false);
    if (item.stream) setStream(item.stream);
    setYear(item.year !== undefined && item.year !== null ? String(item.year) : "");
    setSortOrder(item.sort_order ?? 0);
    setError(null);
    setShowDetails(false);
  }, [item]);

  if (!isOpen || !item) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await quickUpdateItem(kind, item!.id, {
        title,
        slug,
        status,
        featured,
        stream,
        year: year.trim() !== "" ? Number(year) : null,
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
    <MobileSheet
      open={isOpen}
      onClose={onClose}
      title="Quick edit"
      subtitle={item.title}
      actions={
        <SheetActions
          onCancel={onClose}
          confirmLabel={busy ? "Updating…" : "Update"}
          confirmDisabled={busy || !title.trim()}
          form={formId}
        />
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4">
        <Field label="Title">
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>

        {/* Publishing is the decision this sheet exists for, so it is a pair of
            real targets rather than a select hiding one of two options. */}
        <fieldset>
          <legend className="mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint">
            Status
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {(["draft", "published"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={`min-h-12 rounded-md border text-sm font-semibold capitalize transition-colors ${
                  status === value
                    ? "border-hl bg-hl-soft text-ink"
                    : "border-line bg-raise text-soft hover:text-ink"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="rounded-md border border-line bg-raise px-3">
          <CheckRow
            label="Featured"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
        </div>

        <button
          type="button"
          onClick={() => setShowDetails((open) => !open)}
          aria-expanded={showDetails}
          className="flex min-h-12 w-full items-center justify-between rounded-md border border-line px-3.5 text-sm font-medium text-soft transition-colors hover:text-ink"
        >
          More details
          <span aria-hidden className={showDetails ? "rotate-180 transition-transform" : "transition-transform"}>
            ⌄
          </span>
        </button>

        {showDetails && (
          <div className="space-y-4">
            <Field label="Slug" hint="The address this appears at on the public site.">
              <TextInput value={slug} onChange={(e) => setSlug(e.target.value)} />
            </Field>

            {isProject && (
              <>
                <Field label="Stream">
                  <Select value={stream} onChange={(e) => setStream(e.target.value)}>
                    {Object.entries(STREAMS).map(([key, s]) => (
                      <option key={key} value={key}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Year">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                    />
                  </Field>
                  <Field label="Sort order">
                    <TextInput
                      type="number"
                      inputMode="numeric"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>
              </>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="rounded border border-red/40 bg-red-soft px-3 py-2 text-sm font-medium text-red">
            {error}
          </p>
        )}
      </form>
    </MobileSheet>
  );
}
