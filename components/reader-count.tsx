"use client";

import { useEffect, useState } from "react";
import { Tally } from "./bits/tally";
import {
  browserStorage,
  formatReaders,
  READ_DWELL_MS,
  READ_WINDOW_MS,
  readStorageKey,
  recallReaders,
  rememberReaders,
  type ReadKind,
} from "@/lib/readers";

/**
 * "128 readers", on the entry itself, and the visit that makes it 129.
 *
 * The page is static, so the number it arrives with is the one from its last
 * regeneration, and it is not to be trusted: a page is regenerated only when
 * somebody asks for it after a minute has passed, so on a quiet notebook it
 * is routinely several reads behind — and a page built before its first read
 * carries no number at all. Two things correct it:
 *
 *   - what this browser has already shown for the entry today, applied the
 *     moment the page is live, so a refresh never counts backwards while
 *     it waits (see recallReaders() in lib/readers.ts);
 *   - the live count, asked for as the page opens.
 *
 * Separately, this visit is counted once it has become a read, and the total
 * the server hands back is shown. A read is a few seconds with the page
 * actually on screen: the clock only runs while the tab is visible, so a
 * background tab opened from a list never counts. After that, this browser
 * does not count the same entry again for a day. What is and is not a reader
 * beyond that — crawlers, the author — is decided by the route.
 *
 * Every number that arrives only ever raises what is shown. Counts do not go
 * down, so whichever answer lands last — the lookup, the count, the memory —
 * cannot put an older one back on screen. And nothing is printed until the
 * memory has been read, so the page's own number is never glimpsed first.
 */
export function ReaderCount({
  kind,
  id,
  initial,
  separator = false,
}: {
  kind: ReadKind;
  id: string;
  /** The count the page was rendered with, shown until a newer one is known. */
  initial?: number | null;
  /** Lead with the "/" the ledger strip puts between its items. */
  separator?: boolean;
}) {
  const [count, setCount] = useState<number | null>(initial ?? null);
  // Nothing is printed before this browser has had its say. The page's own
  // number, painted before the scripts arrive, is exactly the one that can be
  // lower than what this reader saw a moment ago.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const store = browserStorage();
    const raise = (value: number) => setCount((shown) => Math.max(shown ?? 0, value));
    const show = (value: unknown) => {
      if (cancelled || typeof value !== "number" || !Number.isFinite(value)) return;
      raise(value);
      rememberReaders(store, kind, id, value);
    };

    const recalled = recallReaders(store, kind, id);
    if (recalled !== null) raise(recalled);
    setReady(true);

    // The live number, for everyone — including a visitor this browser has
    // already counted today, and the author. Counts nothing.
    const lookup = new AbortController();
    fetch(`/api/reads?kind=${kind}&id=${encodeURIComponent(id)}`, { signal: lookup.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => show(data?.reads))
      .catch(() => {
        /* a counter is never worth an error on screen */
      });

    const key = readStorageKey(kind, id);
    let last = 0;
    try {
      last = Number(store?.getItem(key)) || 0;
    } catch {
      // Storage refused (private mode, site data off): every visit is new.
    }
    if (Date.now() - last < READ_WINDOW_MS) {
      return () => {
        cancelled = true;
        lookup.abort();
      };
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const record = () => {
      timer = null;
      done = true;
      try {
        store?.setItem(key, String(Date.now()));
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
        .then((data) => show(data?.reads))
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
      lookup.abort();
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, id]);

  const label = ready ? formatReaders(count) : null;
  if (!label || count === null) return null;
  return (
    <span className="flex items-center gap-2.5">
      {separator && (
        <span aria-hidden className="text-line-strong">
          /
        </span>
      )}
      {/* Rolls over when the number goes up while the page is open — the live
          count arriving, or this visit being counted. */}
      <Tally value={count} format={formatReaders} />
    </span>
  );
}

/**
 * The count on a card in Works and Journal.
 *
 * The lists are static too, and they do not ask for live numbers — one page
 * of cards would be one request per card. They do start from what this
 * browser has already shown, though: read an entry, see "2 readers", go back
 * to the list, and its card says 2, not the 1 the list was built with.
 */
export function ReaderTally({
  kind,
  id,
  reads,
  separator = false,
  className,
}: {
  kind: ReadKind;
  id: string;
  /** The count the list was rendered with. */
  reads?: number | null;
  /** Lead with the "/" the card's meta line puts between its items. */
  separator?: boolean;
  className?: string;
}) {
  // Printed once this browser's memory has been read, for the same reason as
  // on the entry page: the list's own number can be the lower one.
  const [recalled, setRecalled] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setRecalled(recallReaders(browserStorage(), kind, id));
    setReady(true);
  }, [kind, id]);

  const label = ready ? formatReaders(Math.max(reads ?? 0, recalled ?? 0)) : null;
  if (!label) return null;
  return (
    <>
      {separator && (
        <span aria-hidden className="text-line-strong">
          /
        </span>
      )}
      <span className={className}>{label}</span>
    </>
  );
}
