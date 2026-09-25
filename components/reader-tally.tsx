"use client";

import { useEffect, useState } from "react";
import { browserStorage, formatReaders, recallReaders, type ReadKind } from "@/lib/readers";

/**
 * The count on a card in Works and Journal.
 *
 * Its own module, apart from ReaderCount in reader-count.tsx: the cards are
 * on every list, and the entry page's count brings the rolling Tally with
 * it — which a card, whose number never changes while it is looked at, has
 * no use for.
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
