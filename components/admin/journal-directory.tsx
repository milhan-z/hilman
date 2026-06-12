"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuickEditModal } from "./quick-edit-modal";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { bulkUpdateItems, bulkDeleteItems } from "@/app/admin/actions";

interface JournalItem {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft";
  featured: boolean;
  published_at: string | null;
  updated_at: string;
}

interface JournalDirectoryProps {
  initialPosts: JournalItem[];
}

function StatusToggle({
  status,
  busy,
  onToggle,
}: {
  status: "published" | "draft";
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onToggle}
      title={status === "published" ? "Tap to unpublish" : "Tap to publish"}
      className={cn(
        "min-h-[32px] rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 disabled:opacity-50",
        status === "published"
          ? "bg-pen-soft text-pen hover:bg-pen-soft/70"
          : "bg-n-200 text-soft hover:bg-n-300"
      )}
    >
      {status}
    </button>
  );
}

export function JournalDirectory({ initialPosts }: JournalDirectoryProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingItem, setEditingItem] = useState<JournalItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const filteredPosts = initialPosts.filter((j) => {
    const matchesSearch =
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.slug || "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || j.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const toggleStatus = async (j: JournalItem) => {
    if (busy) return;
    setBusy(true);
    const res = await bulkUpdateItems("journal", [j.id], {
      status: j.status === "published" ? "draft" : "published",
    });
    setBusy(false);
    if (res.status === "success") router.refresh();
    else alert(res.message || "Failed to update status.");
  };

  const handleBulkStatus = async (status: "published" | "draft") => {
    if (selectedIds.length === 0 || busy) return;
    setBusy(true);
    const res = await bulkUpdateItems("journal", selectedIds, { status });
    setBusy(false);
    if (res.status === "success") {
      setSelectedIds([]);
      router.refresh();
    } else {
      alert(res.message || "Failed to update items.");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0 || busy) return;
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} journal entry/entries permanently?`)) {
      return;
    }
    setBusy(true);
    const res = await bulkDeleteItems("journal", selectedIds);
    setBusy(false);
    if (res.status === "success") {
      setSelectedIds([]);
      router.refresh();
    } else {
      alert(res.message || "Failed to delete items.");
    }
  };

  const toggleSelect = (id: string, checked: boolean) =>
    setSelectedIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  return (
    <div className="space-y-5">
      {/* Title Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Journal</h1>
          <p className="mt-0.5 hidden text-xs text-faint sm:block">Manage articles and log writing</p>
        </div>
        <Link
          href="/admin/journal/new"
          className="shrink-0 rounded-md bg-hl px-4 py-2.5 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90"
        >
          + New<span className="hidden sm:inline"> Entry</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-card sm:gap-3 sm:p-4">
        <div className="min-w-[160px] flex-1">
          <input
            type="search"
            placeholder="Search journal entries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[42px] w-full rounded border border-line bg-raise px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-pen"
          />
        </div>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[42px] flex-1 rounded border border-line bg-raise px-3 py-2 text-sm text-ink outline-none focus:border-pen sm:max-w-[160px]"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* ── Mobile: card list ── */}
      <div className="space-y-3 md:hidden">
        {filteredPosts.map((j) => {
          const isSelected = selectedIds.includes(j.id);
          return (
            <div
              key={j.id}
              className={cn(
                "rounded-lg border bg-surface p-4 shadow-card transition-colors",
                isSelected ? "border-hl bg-pen-soft/10" : "border-line"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/journal/${j.id}`} className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {j.featured && <span aria-hidden className="mr-1 text-pen">✦</span>}
                    {j.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-2xs text-faint">
                    {j.published_at ? formatDate(j.published_at) : "not published yet"}
                  </p>
                </Link>
                <StatusToggle status={j.status} busy={busy} onToggle={() => toggleStatus(j)} />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-dashed border-line pt-3">
                <Link
                  href={`/admin/journal/${j.id}`}
                  className="flex min-h-[40px] flex-1 items-center justify-center rounded border border-line text-xs font-semibold text-pen"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => setEditingItem(j)}
                  className="flex min-h-[40px] flex-1 items-center justify-center rounded border border-line text-xs font-semibold text-soft"
                >
                  Quick edit
                </button>
                {j.status === "published" && (
                  <a
                    href={`/journal/${j.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[40px] flex-1 items-center justify-center rounded border border-line text-xs font-semibold text-soft"
                  >
                    View ↗
                  </a>
                )}
                <label className="flex min-h-[40px] items-center px-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${j.title}`}
                    checked={isSelected}
                    onChange={(e) => toggleSelect(j.id, e.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded accent-pen"
                  />
                </label>
              </div>
            </div>
          );
        })}
        {filteredPosts.length === 0 && (
          <p className="rounded-lg border border-dashed border-line-strong p-8 text-center text-sm italic text-faint">
            No matching journal entries found.
          </p>
        )}
      </div>

      {/* ── Desktop: table ── */}
      <div className="hidden overflow-hidden rounded-lg border border-line bg-surface shadow-card md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-line bg-raise text-xs font-bold uppercase tracking-wider text-soft">
              <tr>
                <th className="w-10 px-5 py-3.5">
                  <input
                    type="checkbox"
                    aria-label="Select all posts"
                    checked={
                      filteredPosts.length > 0 &&
                      filteredPosts.every((j) => selectedIds.includes(j.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredPosts.map((j) => j.id) : [])
                    }
                    className="h-4 w-4 cursor-pointer rounded accent-pen"
                  />
                </th>
                <th className="px-5 py-3.5">Title</th>
                <th className="px-5 py-3.5">Date Published</th>
                <th className="px-5 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredPosts.map((j) => {
                const isSelected = selectedIds.includes(j.id);
                return (
                  <tr
                    key={j.id}
                    className={cn(
                      "group transition-colors hover:bg-card-hover",
                      isSelected && "bg-pen-soft/20"
                    )}
                  >
                    <td className="w-10 px-5 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${j.title}`}
                        checked={isSelected}
                        onChange={(e) => toggleSelect(j.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded accent-pen"
                      />
                    </td>
                    <td className="min-w-[200px] px-5 py-4">
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        {j.featured && (
                          <span aria-hidden className="text-pen" title="Featured / pinned">✦</span>
                        )}
                        <Link href={`/admin/journal/${j.id}`} className="transition-colors hover:text-pen">
                          {j.title}
                        </Link>
                      </div>
                      <div className="mt-0.5 max-w-xs truncate font-mono text-2xs text-faint sm:max-w-md">
                        Slug: {j.slug || "—"}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Link href={`/admin/journal/${j.id}`} className="text-pen hover:underline">
                          Edit
                        </Link>
                        <span className="text-line-strong">•</span>
                        <button type="button" onClick={() => setEditingItem(j)} className="text-pen hover:underline">
                          Quick Edit
                        </button>
                        {j.status === "published" && (
                          <>
                            <span className="text-line-strong">•</span>
                            <a href={`/journal/${j.slug}`} target="_blank" rel="noopener noreferrer" className="text-pen hover:underline">
                              View Live ↗
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-mono text-soft">
                      {j.published_at ? formatDate(j.published_at) : "Draft / Unpublished"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusToggle status={j.status} busy={busy} onToggle={() => toggleStatus(j)} />
                    </td>
                  </tr>
                );
              })}

              {filteredPosts.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center italic text-faint">
                    No matching journal entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Edit Modal */}
      <QuickEditModal
        isOpen={!!editingItem}
        kind="journal"
        item={editingItem}
        onClose={() => setEditingItem(null)}
      />

      {/* Sticky Bulk Action Panel */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-fit -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-full border border-line bg-raise/95 px-5 py-3 shadow-sticky backdrop-blur lg:bottom-6">
          <span className="text-xs font-semibold text-soft">
            {selectedIds.length} selected
          </span>
          <div className="hidden h-4 w-px bg-line sm:block" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleBulkStatus("published")}
              className="min-h-[36px] rounded bg-hl px-3 py-1.5 text-xs font-bold text-hl-ink shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Publish
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => handleBulkStatus("draft")}
              className="min-h-[36px] rounded bg-n-200 px-3 py-1.5 text-xs font-bold text-soft transition-colors hover:bg-n-300 disabled:opacity-50"
            >
              Draft
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleBulkDelete}
              className="min-h-[36px] rounded bg-red px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Delete
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelectedIds([])}
              className="min-h-[36px] px-1 text-xs font-semibold text-faint transition-colors hover:text-ink disabled:opacity-50"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
