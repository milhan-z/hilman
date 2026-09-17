"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HiddenNotice } from "./hidden-notice";
import { ActionSheet, MoreButton, type ActionItem } from "./mobile/action-sheet";
import { PublishBadge, StatusLine } from "./mobile/status-line";
import { useSyncState } from "./studio-runtime";
import { bulkDeleteItems, bulkUpdateItems } from "@/app/admin/actions";
import { cn } from "@/lib/utils";

/**
 * Projects and Journal, which were two nearly identical 380-line files.
 *
 * Both were a dense desktop table with a card list bolted on underneath for
 * phones, and the two halves had already started to disagree. There is one
 * list now, at every width: rows you can hit with a thumb, with the extra
 * columns the table used to carry folded into the line under the title.
 *
 * Three things deliberately changed behaviour.
 *
 * The status badge is no longer a button. Tapping the word "draft" published
 * the project — a one-tap, unconfirmed change to what the public can see,
 * sitting under your thumb in a scrolling list. Publishing moved into the ••• menu
 * where it is a named choice.
 *
 * Nothing calls router.refresh() on success any more. A refresh re-runs the
 * whole server page for a change we already know the shape of, which on a
 * phone is a visible stall; the row updates itself and reverts if the server
 * disagrees.
 *
 * Quick Edit is gone. It was a second editor with its own save semantics —
 * server-only, no queue, no local copy — for fields the real editor now keeps
 * one tap away in Details. Two mental models for saving the same row is the
 * thing this redesign is mostly about removing.
 */

export interface DirectoryItem {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft";
  featured: boolean;
  /** The line under the title: "Design · 2026", "12 Sep". */
  meta: string;
  /** What the group filter matches on — a project's stream. */
  group?: string;
  /** Set when the item is published but screened out of the public site. */
  hiddenReasons?: string[];
}

export interface ContentDirectoryProps {
  kind: "project" | "journal";
  title: string;
  items: DirectoryItem[];
  newHref: string;
  /** "/works" or "/journal" — where a live item can be read. */
  publicBase: string;
  /** Projects filter by stream; journal has nothing to group by. */
  groups?: { value: string; label: string }[];
  searchPlaceholder: string;
}

type StatusFilter = "all" | "draft" | "published";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Live" },
];

export function ContentDirectory({
  kind,
  title,
  items,
  newHref,
  publicBase,
  groups,
  searchPlaceholder,
}: ContentDirectoryProps) {
  const router = useRouter();
  const sync = useSyncState();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [group, setGroup] = useState("all");

  /** Local overrides so a publish shows instantly instead of after a refetch. */
  const [overrides, setOverrides] = useState<Record<string, "published" | "draft">>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  // New server data supersedes anything we were guessing at.
  useEffect(() => setOverrides({}), [items]);

  const resolved = useMemo(
    () => items.map((item) => ({ ...item, status: overrides[item.id] ?? item.status })),
    [items, overrides]
  );

  const visible = resolved.filter((item) => {
    const needle = search.trim().toLowerCase();
    const matchesSearch =
      !needle ||
      item.title.toLowerCase().includes(needle) ||
      (item.slug || "").toLowerCase().includes(needle);
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const matchesGroup = group === "all" || item.group === group;
    return matchesSearch && matchesStatus && matchesGroup;
  });

  const counts = {
    all: resolved.length,
    draft: resolved.filter((item) => item.status === "draft").length,
    published: resolved.filter((item) => item.status === "published").length,
  };

  async function setStatus(ids: string[], status: "published" | "draft") {
    if (ids.length === 0) return;
    setError(null);
    setBusyId(ids[0]);

    const previous = Object.fromEntries(
      ids.map((id) => [id, resolved.find((item) => item.id === id)?.status ?? "draft"])
    );
    setOverrides((current) => ({
      ...current,
      ...Object.fromEntries(ids.map((id) => [id, status])),
    }));

    const result = await bulkUpdateItems(kind, ids, { status });
    setBusyId(null);

    if (result.status === "error") {
      // Put the rows back where they were: the public site never changed.
      setOverrides((current) => ({ ...current, ...previous }));
      setError(result.message ?? "That change didn't go through.");
      return;
    }
    setSelected([]);
  }

  async function remove(ids: string[]) {
    if (ids.length === 0) return;
    setError(null);
    setBusyId(ids[0]);
    const result = await bulkDeleteItems(kind, ids);
    setBusyId(null);

    if (result.status === "error") {
      setError(result.message ?? "That couldn't be deleted.");
      return;
    }
    setSelected([]);
    // A delete genuinely removes a row from the list, so this one has to
    // re-read — there is nothing left locally to show in its place.
    router.refresh();
  }

  const menuItem = resolved.find((item) => item.id === menuFor) ?? null;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <Link
          href={newHref}
          prefetch={false}
          className="flex min-h-12 shrink-0 items-center rounded-md bg-hl px-4 text-sm font-semibold text-hl-ink shadow-card"
        >
          + New
        </Link>
      </div>

      <div className="space-y-2.5">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={searchPlaceholder}
          // text-base: Safari zooms the page into any field smaller than 16px.
          className="min-h-12 w-full rounded-md border border-line bg-raise px-3.5 text-base text-ink outline-none transition-colors focus:border-pen"
        />

        <div className="flex items-center gap-2">
          <div role="group" aria-label="Filter by status" className="flex gap-1.5">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                aria-pressed={statusFilter === filter.value}
                className={cn(
                  "min-h-12 rounded-full border px-4 text-sm font-medium transition-colors",
                  statusFilter === filter.value
                    ? "border-hl bg-hl-soft text-ink"
                    : "border-line bg-raise text-soft"
                )}
              >
                {filter.label}
                <span className="ml-1.5 text-xs text-faint">{counts[filter.value]}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setSelecting((on) => !on);
              setSelected([]);
            }}
            aria-pressed={selecting}
            className="ml-auto min-h-12 shrink-0 rounded-full border border-line px-4 text-sm font-medium text-soft transition-colors hover:text-ink"
          >
            {selecting ? "Done" : "Select"}
          </button>
        </div>

        {groups && groups.length > 0 && (
          <select
            aria-label="Filter by stream"
            value={group}
            onChange={(event) => setGroup(event.target.value)}
            className="min-h-12 w-full rounded-md border border-line bg-raise px-3 text-base text-ink outline-none focus:border-pen sm:max-w-xs"
          >
            <option value="all">Every stream</option>
            {groups.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red/40 bg-red-soft/20 px-3.5 py-3 text-sm text-red">
          {error}
        </p>
      )}

      {/* One grouped list, not a stack of cards.
          A bordered, shadowed, rounded rectangle around every row is a web
          page's way of saying "these are separate things". On a phone it wastes
          8px of gutter per item, doubles the visible lines, and makes six
          projects look like six adverts. An app draws one surface and separates
          the rows with a hairline — which is also what makes the whole row feel
          like a single target. */}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {visible.map((item) => {
          const isSelected = selected.includes(item.id);
          const busy = busyId === item.id;

          return (
            <li
              key={item.id}
              className={cn(
                "transition-colors",
                isSelected && "bg-hl-soft/15",
                busy && "opacity-60"
              )}
            >
              <div className="flex items-stretch">
                {selecting && (
                  <label className="flex min-h-[68px] cursor-pointer items-center pl-3.5">
                    <span className="sr-only">Select {item.title}</span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id)
                        )
                      }
                      className="h-5 w-5 accent-[var(--pen)]"
                    />
                  </label>
                )}

                {/* The whole row is the target. */}
                <Link
                  href={`/admin/${kind === "project" ? "projects" : "journal"}/${item.id}`}
                  prefetch={false}
                  className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 transition-colors active:bg-card-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      {item.featured && (
                        <span aria-label="Pinned" title="Pinned" className="shrink-0 text-pen">
                          ✦
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                        {item.title || "Untitled"}
                      </span>
                      <PublishBadge label={item.status === "published" ? "Live" : "Draft"} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-faint">{item.meta}</span>
                  </span>
                </Link>

                <div className="flex items-center pr-1.5">
                  <MoreButton
                    onClick={() => setMenuFor(item.id)}
                    label={`More actions for ${item.title}`}
                  />
                </div>
              </div>

              {item.hiddenReasons?.length ? (
                <div className="px-3.5 pb-3">
                  <HiddenNotice reasons={item.hiddenReasons} compact />
                </div>
              ) : null}
            </li>
          );
        })}

        {visible.length === 0 && (
          <li className="p-8 text-center text-sm text-faint">
            {resolved.length === 0
              ? `Nothing here yet. Tap + New to start one.`
              : "Nothing matches that."}
          </li>
        )}
      </ul>

      <ActionSheet
        open={menuItem !== null}
        onClose={() => setMenuFor(null)}
        title={menuItem?.title || "Untitled"}
        subtitle={menuItem?.status === "published" ? "Live on the site" : "Draft — only you can see it"}
        items={menuItem ? rowActions(menuItem) : []}
      />

      {selecting && selected.length > 0 && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-[85] border-t border-line-strong bg-paper/95 backdrop-blur",
            "px-4 pt-3 pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+68px))] lg:pb-4"
          )}
        >
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <p className="text-sm font-medium text-soft">{selected.length} selected</p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!sync.reachable || busyId !== null}
                onClick={() => void setStatus(selected, "published")}
                className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink disabled:opacity-50"
              >
                Publish
              </button>
              <button
                type="button"
                disabled={!sync.reachable || busyId !== null}
                onClick={() => void setStatus(selected, "draft")}
                className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-semibold text-ink disabled:opacity-50"
              >
                To draft
              </button>
              <button
                type="button"
                disabled={!sync.reachable || busyId !== null}
                onClick={() => void remove(selected)}
                className="min-h-12 rounded-md border border-red/50 bg-red-soft/20 text-sm font-semibold text-red disabled:opacity-50"
              >
                Delete
              </button>
            </div>
            {!sync.reachable && (
              <StatusLine tone="neutral">
                Publishing and deleting need a connection.
              </StatusLine>
            )}
          </div>
        </div>
      )}
    </div>
  );

  function rowActions(item: DirectoryItem & { status: "published" | "draft" }): ActionItem[] {
    const editHref = `/admin/${kind === "project" ? "projects" : "journal"}/${item.id}`;
    const live = item.status === "published";
    const offline = !sync.reachable;

    return [
      { id: "edit", label: "Edit", href: editHref },
      ...(live && !item.hiddenReasons?.length && item.slug
        ? [{ id: "view", label: "View live", href: `${publicBase}/${item.slug}`, external: true } as ActionItem]
        : []),
      live
        ? {
            id: "unpublish",
            label: "Move to draft",
            detail: offline ? "Needs a connection" : "Takes it off the public site",
            disabled: offline,
            onSelect: () => void setStatus([item.id], "draft"),
          }
        : {
            id: "publish",
            label: "Publish",
            detail: offline ? "Needs a connection" : "Puts it on the public site",
            disabled: offline,
            onSelect: () => void setStatus([item.id], "published"),
          },
      {
        id: "delete",
        label: "Delete",
        tone: "danger",
        disabled: offline,
        confirm: `Delete “${item.title || "this"}” for good? This can't be undone.`,
        onSelect: () => void remove([item.id]),
      },
    ];
  }
}
