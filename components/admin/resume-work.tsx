"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDrafts, type LocalDraft } from "@/lib/studio-local/drafts";
import { useSyncState } from "./studio-runtime";

/**
 * Where you left off.
 *
 * On a phone the dashboard's job is not to report on the site, it is to get
 * you back into the sentence you were halfway through. Counts and health
 * checks are useful once a week; an unfinished paragraph is useful now, so it
 * goes first and they go below.
 *
 * Reads the local database, so it is right even when the network is not.
 */

const relative = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** "journal:abc123" → the editor it came from. A quick draft has no row yet. */
function hrefFor(draft: LocalDraft): string | null {
  const [entity, ...rest] = draft.key.split(":");
  const id = rest.join(":");
  if (entity === "project") return `/admin/projects/${id || "new"}`;
  if (entity === "journal") return `/admin/journal/${id || "new"}`;
  return null;
}

export function ResumeWork() {
  const state = useSyncState();
  const [drafts, setDrafts] = useState<LocalDraft[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listDrafts().then((all) => {
      if (cancelled) return;
      setDrafts(all.filter((draft) => hrefFor(draft) !== null).slice(0, 3));
    });
    return () => {
      cancelled = true;
    };
    // Re-read after a sync clears a draft it had saved.
  }, [state.queued, state.lastSyncedAt]);

  if (!drafts || drafts.length === 0) return null;

  return (
    <section aria-labelledby="resume-heading" className="rounded-lg border border-hl/40 bg-hl-soft/15 p-4">
      <h2 id="resume-heading" className="font-display text-base font-bold text-ink">
        Pick up where you left off
      </h2>
      <p className="mt-1 text-sm text-soft">
        Unsaved on this device. Opening one refills the editor — it still only reaches the site
        when you save.
      </p>
      <ul className="mt-3 space-y-2">
        {drafts.map((draft) => {
          const href = hrefFor(draft)!;
          return (
            <li key={draft.key}>
              <Link
                href={href}
                className="flex min-h-12 items-center justify-between gap-3 rounded-md border border-line bg-surface px-3.5 transition-colors hover:border-pen"
              >
                <span className="min-w-0 truncate text-sm font-semibold text-ink">
                  {draft.label ?? "Untitled"}
                </span>
                <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-faint">
                  {relative(draft.editedAt)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
