"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

/**
 * Shown when a page could not read its content. This exists so a broken
 * database never gets mistaken for an empty archive — "nothing here yet" and
 * "we could not load this" must not look the same.
 *
 * "Try again" calls `retry`, not `reset`. In this version of Next.js `reset`
 * only re-renders what the browser already has — the same failed answer — so
 * the button could never succeed; `retry` fetches the page from the server
 * again, which is the whole point of offering it after a failed read.
 */
export default function SiteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[site] render failed:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto max-w-prose px-5 py-24 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-red">
        Content unavailable
      </p>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl">
        This page could not load its content.
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-soft">
        Something went wrong reading the archive — this is a fault on my side, not
        an empty shelf. The work is still there.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-faint">Reference: {error.digest}</p>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <button
          onClick={() => retry()}
          className="rounded bg-hl px-5 py-2.5 text-sm font-semibold text-hl-ink transition-opacity hover:opacity-90"
        >
          Try again
        </button>
        <Button href="/" variant="ghost">
          Back to the cover
        </Button>
      </div>
    </div>
  );
}
