/**
 * "Published" in the database, still not on the public site.
 *
 * Shown wherever an item's status is, so the two never disagree silently. The
 * reason is rendered as text rather than a tooltip — a title attribute is
 * unreachable on a touch screen, which is where this studio gets used.
 */
export function HiddenNotice({ reasons, compact = false }: { reasons?: string[]; compact?: boolean }) {
  if (!reasons?.length) return null;

  return (
    <div className={compact ? "mt-1" : "mt-1.5"}>
      <span className="inline-block rounded-full bg-red-soft px-2 py-0.5 text-3xs font-bold uppercase tracking-wide text-red">
        Not on the site
      </span>
      <p className="mt-1 max-w-md text-2xs leading-relaxed text-soft">{reasons.join(" ")}</p>
    </div>
  );
}
