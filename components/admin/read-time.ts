"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { needsHtmlToText, readTimeMinutesWith, type ReadTimeInput } from "@/lib/read-time-core";

/**
 * Reading time in the editor, without the HTML parser in its first download.
 *
 * The number is the one lib/read-time.ts produces at the save boundary — the
 * same code, not a browser-side approximation of it. What changes is when the
 * parser arrives. A document with no Custom HTML never needs it, so it is
 * counted straight from lib/read-time-core.ts. A document with some fetches
 * lib/read-time.ts, once, the way clip-optimize.ts fetches its encoder: when
 * something actually needs it and not before.
 */

type ReadTime = typeof import("@/lib/read-time");

let readTime: ReadTime | null = null;
let fetching: Promise<ReadTime> | null = null;
const arrivals = new Set<() => void>();

/**
 * lib/read-time.ts, fetched once.
 *
 * A fetch that fails — the studio is offline, say — is forgotten rather than
 * kept, so the next edit asks again instead of the editor being stuck without
 * a parser for the rest of the session.
 */
function loadReadTime(): Promise<ReadTime> {
  fetching ??= import("@/lib/read-time").then(
    (module) => {
      readTime = module;
      arrivals.forEach((notify) => notify());
      return module;
    },
    (error) => {
      fetching = null;
      throw error;
    }
  );
  return fetching;
}

const subscribe = (notify: () => void) => {
  arrivals.add(notify);
  return () => {
    arrivals.delete(notify);
  };
};

/** Only ever handed a document with no markup in it, so it is never called. */
const noMarkup = (): string => {
  throw new Error("This document has markup to read. Count it with lib/read-time.ts.");
};

/** The count, if it can be made now: there is no markup to read, or the parser is already here. */
export function readTimeMinutesNow(input: ReadTimeInput): number | null {
  if (!needsHtmlToText(input)) return readTimeMinutesWith(input, noMarkup);
  return readTime ? readTime.readTimeMinutes(input) : null;
}

/** The count, fetching the parser first if this document needs one. */
export async function readTimeMinutesFor(input: ReadTimeInput): Promise<number> {
  return readTimeMinutesNow(input) ?? (await loadReadTime()).readTimeMinutes(input);
}

/** Fetches the parser ahead of need, so a Custom HTML block added offline can still be counted. */
export function prefetchReadTime(): Promise<unknown> {
  return loadReadTime();
}

/**
 * Minutes for the document on screen, or `counted` when there is nothing to
 * count (a project has no reading time).
 *
 * `counted` is what the server counted for the document as it was opened —
 * app/admin/journal/[id]/page.tsx does that with lib/read-time.ts. A document
 * with Custom HTML shows it until the parser has arrived, which keeps the
 * server's HTML and the browser's first render identical and means the number
 * never blinks. An edit made in that window keeps the last number that was
 * actually counted until the new one can be.
 */
export function useReadTimeMinutes(input: ReadTimeInput | null, counted: number): number {
  // Null on the server and while hydrating, so both render the same thing.
  const parser = useSyncExternalStore(subscribe, () => readTime, () => null);
  const excerpt = input?.excerpt;
  const blocks = input?.blocks;

  const now = useMemo(() => {
    if (!blocks) return null;
    const document = { excerpt, blocks };
    if (!needsHtmlToText(document)) return readTimeMinutesWith(document, noMarkup);
    return parser ? parser.readTimeMinutes(document) : null;
  }, [excerpt, blocks, parser]);

  const waiting = Boolean(blocks) && now === null;
  useEffect(() => {
    // Offline, the last count stays on screen; the next edit asks again.
    if (waiting) loadReadTime().catch(() => {});
  }, [waiting, excerpt, blocks]);

  // Remembered, so a document waiting on the parser keeps saying what it said.
  const [last, setLast] = useState(counted);
  if (now !== null && now !== last) setLast(now);
  return now ?? last;
}
