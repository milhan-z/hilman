"use client";

import { useEffect, useState } from "react";
import {
  formatReaders,
  READ_DWELL_MS,
  READ_WINDOW_MS,
  readStorageKey,
  type ReadKind,
} from "@/lib/readers";

/**
 * "128 readers", on the entry itself, and the visit that makes it 129.
 *
 * The page is static, so the number it arrives with is the one from its last
 * regeneration — a minute old at most. This shows that immediately, with no
 * request and no layout shift, then counts this visit once it has become a
 * read, and shows the fresh total the server hands back.
 *
 * A read is a few seconds with the page actually on screen: the clock only
 * runs while the tab is visible, so a background tab opened from a list never
 * counts. After that, this browser does not count the same entry again for a
 * day. What is and is not a reader beyond that — crawlers, the author — is
 * decided by the route; see lib/readers.ts.
 */
export function ReaderCount({
  kind,
  id,
  initial,
  separator = false,
}: {
  kind: ReadKind;
  id: string;
  /** The count the page was rendered with. */
  initial?: number | null;
  /** Lead with the "/" the ledger strip puts between its items. */
  separator?: boolean;
}) {
  const [count, setCount] = useState<number | null>(initial ?? null);

  useEffect(() => {
    const key = readStorageKey(kind, id);
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(key)) || 0;
    } catch {
      // Storage refused (private mode, site data off): every visit is new.
    }
    if (Date.now() - last < READ_WINDOW_MS) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;
    let cancelled = false;

    const record = () => {
      timer = null;
      done = true;
      try {
        window.localStorage.setItem(key, String(Date.now()));
      } catch {
        /* see above */
      }
      fetch("/api/reads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
        // Delivered even if the reader leaves the page as it is sent.
        keepalive: true,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
          if (!cancelled && typeof data?.reads === "number") setCount(data.reads);
        })
        .catch(() => {
          /* a counter is never worth an error on screen */
        });
    };

    const arm = () => {
      if (!done && timer === null && document.visibilityState === "visible") {
        timer = setTimeout(record, READ_DWELL_MS);
      }
    };
    const disarm = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? arm() : disarm());

    arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, id]);

  const label = formatReaders(count);
  if (!label) return null;
  return (
    <span className="flex items-center gap-2.5">
      {separator && (
        <span aria-hidden className="text-line-strong">
          /
        </span>
      )}
      {label}
    </span>
  );
}
