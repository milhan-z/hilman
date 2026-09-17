"use client";

import { useState, useTransition } from "react";
import { signOut } from "@/app/admin/actions";
import { forgetLocalStudioData, useSyncState } from "./studio-runtime";
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
 */
export function SignOutButton({ className }: { className?: string }) {
  const state = useSyncState();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const unsent = state.queued + state.blocked + state.conflicts;

  function leave() {
    startTransition(async () => {
      await forgetLocalStudioData();
      await signOut();
    });
  }

  if (confirming) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-sm text-red">
          {unsent} {unsent === 1 ? "change hasn't" : "changes haven't"} reached the site.
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
          onClick={() => setConfirming(false)}
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
      onClick={() => (unsent > 0 ? setConfirming(true) : leave())}
      disabled={pending}
      className={cn("text-soft transition-colors hover:text-red disabled:opacity-50", className)}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
