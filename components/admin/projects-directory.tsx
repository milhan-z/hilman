"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuickEditModal } from "./quick-edit-modal";
import { STREAMS, type Stream } from "@/lib/types";
import { cn } from "@/lib/utils";
import { bulkUpdateItems, bulkDeleteItems } from "@/app/admin/actions";

interface ProjectItem {
  id: string;
  title: string;
  slug: string;
  stream: string;
  status: "published" | "draft";
  featured: boolean;
  year: number | null;
  sort_order: number;
}

interface ProjectsDirectoryProps {
  initialProjects: ProjectItem[];
}

/** One-tap publish/draft toggle — the status badge IS the button. */
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

export function ProjectsDirectory({ initialProjects }: ProjectsDirectoryProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [streamFilter, setStreamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const filteredProjects = initialProjects.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.slug || "").toLowerCase().includes(search.toLowerCase());
    const matchesStream = streamFilter === "all" || p.stream === streamFilter;
    const matchesStatus = statusFilter === "all" || p.status === statusFilter;
    return matchesSearch && matchesStream && matchesStatus;
  });

  const toggleStatus = async (p: ProjectItem) => {
    if (busy) return;
    setBusy(true);
    const res = await bulkUpdateItems("project", [p.id], {
      status: p.status === "published" ? "draft" : "published",
    });
    setBusy(false);
    if (res.status === "success") router.refresh();
    else alert(res.message || "Failed to update status.");
  };

  const handleBulkStatus = async (status: "published" | "draft") => {
    if (selectedIds.length === 0 || busy) return;
    setBusy(true);
    const res = await bulkUpdateItems("project", selectedIds, { status });
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
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} project(s) permanently?`)) {
      return;
    }
    setBusy(true);
    const res = await bulkDeleteItems("project", selectedIds);
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
          <h1 className="font-display text-2xl font-bold">Projects</h1>
          <p className="mt-0.5 hidden text-xs text-faint sm:block">Manage case studies and works</p>
        </div>
        <Link
          href="/admin/projects/new"
          className="shrink-0 rounded-md bg-hl px-4 py-2.5 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90"
        >
          + New<span className="hidden sm:inline"> Project</span>
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-surface p-3 shadow-card sm:gap-3 sm:p-4">
        <div className="min-w-[160px] flex-1">
          <input
            type="search"
            placeholder="Search by title or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-h-[42px] w-full rounded border border-line bg-raise px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-pen"
          />
        </div>
        <select
          aria-label="Filter by stream"
          value={streamFilter}
          onChange={(e) => setStreamFilter(e.target.value)}
          className="min-h-[42px] flex-1 rounded border border-line bg-raise px-3 py-2 text-sm text-ink outline-none focus:border-pen sm:max-w-[180px]"
        >
          <option value="all">All Streams</option>
          {Object.entries(STREAMS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-[42px] flex-1 rounded border border-line bg-raise px-3 py-2 text-sm text-ink outline-none focus:border-pen sm:max-w-[150px]"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>

      {/* ── Mobile: card list ── */}
      <div className="space-y-3 md:hidden">
        {filteredProjects.map((p) => {
          const isSelected = selectedIds.includes(p.id);
          return (
            <div
              key={p.id}
              className={cn(
                "rounded-lg border bg-surface p-4 shadow-card transition-colors",
                isSelected ? "border-hl bg-pen-soft/10" : "border-line"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <Link href={`/admin/projects/${p.id}`} className="min-w-0">
                  <p className="truncate font-semibold text-ink">
                    {p.featured && <span aria-hidden className="mr-1 text-pen">✦</span>}
                    {p.title}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-2xs text-faint">
                    {STREAMS[p.stream as Stream]?.name ?? p.stream}
                    {p.year ? ` · ${p.year}` : ""}
                  </p>
                </Link>
                <StatusToggle status={p.status} busy={busy} onToggle={() => toggleStatus(p)} />
              </div>
              <div className="mt-3 flex items-center gap-2 border-t border-dashed border-line pt-3">
                <Link
                  href={`/admin/projects/${p.id}`}
                  className="flex min-h-[40px] flex-1 items-center justify-center rounded border border-line text-xs font-semibold text-pen"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => setEditingItem(p)}
                  className="flex min-h-[40px] flex-1 items-center justify-center rounded border border-line text-xs font-semibold text-soft"
                >
                  Quick edit
                </button>
                {p.status === "published" && (
                  <a
                    href={`/works/${p.slug}`}
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
                    aria-label={`Select ${p.title}`}
                    checked={isSelected}
                    onChange={(e) => toggleSelect(p.id, e.target.checked)}
                    className="h-5 w-5 cursor-pointer rounded accent-pen"
                  />
                </label>
              </div>
            </div>
          );
        })}
        {filteredProjects.length === 0 && (
          <p className="rounded-lg border border-dashed border-line-strong p-8 text-center text-sm italic text-faint">
            No matching projects found.
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
                    aria-label="Select all projects"
                    checked={
                      filteredProjects.length > 0 &&
                      filteredProjects.every((p) => selectedIds.includes(p.id))
                    }
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? filteredProjects.map((p) => p.id) : [])
                    }
                    className="h-4 w-4 cursor-pointer rounded accent-pen"
                  />
                </th>
                <th className="px-5 py-3.5">Title</th>
                <th className="px-5 py-3.5">Stream</th>
                <th className="hidden px-5 py-3.5 lg:table-cell">Year</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="hidden px-5 py-3.5 text-center lg:table-cell">Sort</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredProjects.map((p) => {
                const isSelected = selectedIds.includes(p.id);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "group transition-colors hover:bg-card-hover",
                      isSelected && "bg-pen-soft/20"
                    )}
                  >
                    <td className="w-10 px-5 py-4">
                      <input
                        type="checkbox"
                        aria-label={`Select ${p.title}`}
                        checked={isSelected}
                        onChange={(e) => toggleSelect(p.id, e.target.checked)}
                        className="h-4 w-4 cursor-pointer rounded accent-pen"
                      />
                    </td>
                    <td className="min-w-[200px] px-5 py-4">
                      <div className="flex items-center gap-1.5 font-semibold text-ink">
                        {p.featured && (
                          <span aria-hidden className="text-pen" title="Featured / pinned">✦</span>
                        )}
                        <Link href={`/admin/projects/${p.id}`} className="transition-colors hover:text-pen">
                          {p.title}
                        </Link>
                      </div>
                      <div className="mt-0.5 max-w-xs truncate font-mono text-2xs text-faint sm:max-w-md">
                        Slug: {p.slug || "—"}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-3xs font-semibold uppercase tracking-wider text-soft opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Link href={`/admin/projects/${p.id}`} className="text-pen hover:underline">
                          Edit
                        </Link>
                        <span className="text-line-strong">•</span>
                        <button type="button" onClick={() => setEditingItem(p)} className="text-pen hover:underline">
                          Quick Edit
                        </button>
                        {p.status === "published" && (
                          <>
                            <span className="text-line-strong">•</span>
                            <a href={`/works/${p.slug}`} target="_blank" rel="noopener noreferrer" className="text-pen hover:underline">
                              View Live ↗
                            </a>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 font-medium text-soft">
                      {STREAMS[p.stream as Stream]?.name || p.stream}
                    </td>
                    <td className="hidden px-5 py-4 font-mono font-medium text-faint lg:table-cell">
                      {p.year || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <StatusToggle status={p.status} busy={busy} onToggle={() => toggleStatus(p)} />
                    </td>
                    <td className="hidden px-5 py-4 text-center font-mono font-semibold text-soft lg:table-cell">
                      {p.sort_order}
                    </td>
                  </tr>
                );
              })}

              {filteredProjects.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center italic text-faint">
                    No matching projects found.
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
        kind="project"
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
