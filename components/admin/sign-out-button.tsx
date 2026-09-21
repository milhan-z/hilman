"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/app/admin/actions";
import { forgetLocalStudioData } from "./studio-runtime";
import { describeLocalWork, surveyLocalWork, type LocalWork } from "@/lib/studio-local/recovery";
import { cn } from "@/lib/utils";

/**
 * Closing the door, and taking the drafts with you.
 *
 * Signing out has to clear what this browser is holding: drafts and queued
 * saves are unpublished work, and leaving them in a phone's storage after the
 * session ends undoes the point of having a login.
 *
 * But clearing is destructive, so it asks first when there is anything to
 * lose. "Purge on sign-out" written as an unconditional rule is a rule that
 * eventually deletes the only copy of something.
 *
 * ── what it used to be unable to see ──
 *
 * The question used to be `queued + blocked + conflicts`, read from the sync
 * state. Those are all things that have at least been *handed over*. Writing
 * that was typed and never saved lives in `drafts` and nowhere else — so the
 * one category with no other copy anywhere was the one category the warning
 * could not count, and it went without a word. Photographs still waiting to
 * upload were invisible for the same reason.
 *
 * The inventory is now taken at the moment it matters, from storage rather
 * than from a cached counter, and it says which kinds of work it found —
 * "3 changes" is not a true sentence when it is one save and two photographs.
 */
export function SignOutButton({ className }: { className?: string }) {
  const [pending, startTransition] = useTransition();
  const [checking, setChecking] = useState(false);
  const [work, setWork] = useState<LocalWork | null>(null);

  function leave() {
    startTransition(async () => {
      await forgetLocalStudioData();
      await signOut();
    });
  }

  async function begin() {
    setChecking(true);
    try {
      const found = await surveyLocalWork();
      if (found.total === 0) {
        leave();
        return;
      }
      setWork(found);
    } finally {
      setChecking(false);
    }
  }

  if (work) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-sm text-red">
          {describeLocalWork(work)} Signing out deletes {work.total === 1 ? "it" : "them"}.
        </span>
        <button
          type="button"
          onClick={leave}
          disabled={pending}
          className="inline-flex min-h-11 items-center rounded border border-red px-3 text-sm font-semibold text-red disabled:opacity-50"
        >
          {pending ? "Signing out…" : "Discard & sign out"}
        </button>
        <button
          type="button"
          onClick={() => setWork(null)}
          className="inline-flex min-h-11 items-center px-2 text-sm text-soft hover:text-ink"
        >
          Stay
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void begin()}
      disabled={pending || checking}
      className={cn("text-soft transition-colors hover:text-red disabled:opacity-50", className)}
    >
      {pending ? "Signing out…" : checking ? "Checking…" : "Sign out"}
    </button>
  );
}
