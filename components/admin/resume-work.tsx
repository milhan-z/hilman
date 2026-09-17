"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listDrafts, type LocalDraft } from "@/lib/studio-local/drafts";
import { listSnapshots, type ServerSnapshot } from "@/lib/studio-local/snapshots";
import { useSyncState } from "./studio-runtime";
import { PublishBadge, useDeviceName } from "./mobile/status-line";

/**
 * Where you left off.
 *
 * On a phone the home screen's job is not to report on the site, it is to get
 * you back into the sentence you were halfway through. Counts and health
 * checks are useful once a week; an unfinished paragraph is useful now, so it
 * goes first and they go below.
 *
 * Reads the local database, so it is right even when the network is not — and
 * it crosses that against the last thing the server said about each row, so a
 * half-edited live article is labelled Live rather than being quietly demoted
 * to "a draft" because there is an unsaved copy of it on this phone.
 */

const relative = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (Number.isNaN(seconds)) return "recently";
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

/** "journal:abc123" → the editor it came from. A quick note has no row yet. */
function hrefFor(draft: LocalDraft): string | null {
  const [entity, ...rest] = draft.key.split(":");
  const id = rest.join(":");
  if (entity === "project") return `/admin/projects/${id || "new"}`;
  if (entity === "journal") return `/admin/journal/${id || "new"}`;
  return null;
}

export function ResumeWork() {
  const state = useSyncState();
  const device = useDeviceName();
  const [rows, setRows] = useState<{ draft: LocalDraft; snapshot?: ServerSnapshot }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listDrafts(), listSnapshots()]).then(([drafts, snapshots]) => {
      if (cancelled) return;
      const byKey = new Map(snapshots.map((snapshot) => [snapshot.key, snapshot]));
      setRows(
        drafts
          .filter((draft) => hrefFor(draft) !== null)
          .slice(0, 3)
          .map((draft) => ({ draft, snapshot: byKey.get(draft.key) }))
      );
    });
    return () => {
      cancelled = true;
    };
    // Re-read after a sync clears a draft it had saved.
  }, [state.queued, state.lastSyncedAt]);

  if (!rows || rows.length === 0) return null;

  return (
    <section aria-labelledby="resume-heading" className="space-y-2.5">
      <h2 id="resume-heading" className="font-mono text-2xs uppercase tracking-widest text-faint">
        Continue
      </h2>
      <ul className="space-y-2.5">
        {rows.map(({ draft, snapshot }) => (
          <li key={draft.key}>
            <Link
              href={hrefFor(draft)!}
              prefetch={false}
              className="flex min-h-[68px] items-center gap-3 rounded-lg border border-hl/50 bg-hl-soft/15 px-3.5 py-3 transition-[background-color,transform] duration-[120ms] hover:border-pen active:scale-[0.99] active:bg-card-hover"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {draft.label ?? "Untitled"}
                  </span>
                  <PublishBadge label={snapshot?.status === "published" ? "Live" : "Draft"} />
                </span>
                <span className="mt-0.5 block truncate text-xs text-faint">
                  Edited {relative(draft.editedAt)} · on {device}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-faint">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">
        These are on {device} and the site has not got them. Opening one refills the editor.
      </p>
    </section>
  );
}
