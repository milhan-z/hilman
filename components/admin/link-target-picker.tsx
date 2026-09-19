"use client";

import { useEffect, useMemo, useState } from "react";
import { getLinkTargets, type LinkTargetRow } from "@/app/admin/actions";
import { classifyLink } from "@/lib/links";
import { cn } from "@/lib/utils";
import { inputCls } from "./fields";

/**
 * Pointing a Link block at something else on this site.
 *
 * The workflow this replaces was "remember the slug, type /works/hilman-studio
 * by hand, then type the title and the description again", on a phone. Which
 * meant cross-linking effectively did not happen. Here it is: pick a kind,
 * tap a thing.
 *
 * ── what selection actually does ──
 *
 * Copies a snapshot — url, title, description, thumbnail — into the block, and
 * nothing else. The public renderer then has everything it needs without
 * asking the database anything, which is what keeps a page of six related
 * cards from becoming seven queries, and what keeps an exported Studio JSON
 * document meaningful on its own.
 *
 * The consequence, deliberately accepted: if the linked entry is later
 * retitled, this card keeps the old wording until somebody reselects it. That
 * is the right trade for a portfolio — the sentence around the card was
 * written to go with *that* wording — and re-picking is one tap.
 *
 * ── drafts ──
 *
 * Selectable, because linking the two halves of a story while writing both is
 * the normal case. But marked, clearly, and with a sentence saying the link
 * will 404 until that entry is published. The alternative — refusing, or
 * quietly publishing the other document — is worse: one blocks a real
 * workflow, the other makes a publish happen that nobody asked for.
 */

type Tab = "project" | "journal";

export function LinkTargetPicker({
  onPick,
}: {
  /** Receives the snapshot to merge into the block. */
  onPick: (target: LinkTargetRow & { kind: Tab }) => void;
}) {
  const [tab, setTab] = useState<Tab>("project");
  const [rows, setRows] = useState<{ projects: LinkTargetRow[]; journal: LinkTargetRow[] } | null>(
    null
  );
  const [search, setSearch] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getLinkTargets()
      .then((index) => {
        if (alive) setRows(index);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const list = useMemo(() => {
    const all = (tab === "project" ? rows?.projects : rows?.journal) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.url.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q)
    );
  }, [rows, tab, search]);

  if (failed) {
    return (
      <p className="text-sm text-soft">
        Couldn&rsquo;t load your entries. Enter the address below instead.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2" role="tablist" aria-label="What to link to">
        {(["project", "journal"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              "min-h-12 flex-1 rounded-md border text-sm font-semibold transition-colors",
              tab === value
                ? "border-pen bg-hl-soft text-ink"
                : "border-line-strong bg-raise text-soft hover:text-ink"
            )}
          >
            {value === "project" ? "Projects" : "Journal"}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="py-2 text-sm text-faint">Loading…</p>
      ) : (
        <>
          {/* Only worth the vertical space once there is enough to sift. */}
          {((tab === "project" ? rows.projects : rows.journal).length > 6 || search) && (
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tab === "project" ? "Search projects" : "Search journal"}
              className={inputCls}
            />
          )}

          {list.length === 0 ? (
            <p className="py-2 text-sm text-faint">
              {search ? "Nothing matches that." : "Nothing here yet."}
            </p>
          ) : (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto">
              {list.map((row) => (
                <li key={row.url}>
                  <button
                    type="button"
                    onClick={() => onPick({ ...row, kind: tab })}
                    className="flex min-h-12 w-full items-center gap-2 rounded-md border border-line bg-raise px-3 py-2 text-left transition-colors hover:border-pen"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {row.title || row.url}
                      </span>
                      <span className="block truncate text-2xs text-faint">{row.url}</span>
                    </span>
                    {!row.live && (
                      <span className="shrink-0 rounded-full bg-hl px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-hl-ink">
                        Draft
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The warning shown once a draft has actually been chosen.
 *
 * Separate from the picker because it belongs next to the resulting block, not
 * next to the list — the author needs it when looking at what they made, not
 * while browsing.
 */
export function DraftTargetWarning({ url, targets }: { url: unknown; targets: LinkTargetRow[] }) {
  const target = classifyLink(url);
  if (target.kind !== "internal") return null;

  const row = targets.find((candidate) => candidate.url === target.href);
  if (!row || row.live) return null;

  return (
    <p role="status" className="rounded border border-hl bg-hl-soft px-3 py-2 text-sm text-soft">
      That entry is still a draft. This link will 404 for visitors until you publish it.
    </p>
  );
}
