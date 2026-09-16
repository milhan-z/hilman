import { Button } from "./ui";

/**
 * Shown when a page could not read its content.
 *
 * The point of this component is separation: "nothing has been published yet"
 * and "the archive could not be reached" used to look identical — an empty
 * grid — which made a broken database read as an empty portfolio.
 */
export function ContentUnavailable({
  what = "this page",
  compact = false,
}: {
  what?: string;
  detail?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={`rounded-lg border border-dashed border-red/50 bg-red-soft/10 text-center ${
        compact ? "p-8" : "p-12"
      }`}
    >
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-red">Content unavailable</p>
      <p className="mt-3 font-display text-xl font-semibold tracking-tight">
        Couldn&apos;t load {what}.
      </p>
      <p className="mx-auto mt-2 max-w-md text-soft">
        This is a fault on my side, not an empty shelf. Please try again in a moment.
      </p>
      {!compact && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button href="/">Back to the cover</Button>
          <Button href="/connect" variant="ghost">
            Tell me it&apos;s broken
          </Button>
        </div>
      )}
    </div>
  );
}

/** Full-page version, for when the whole route failed rather than one section. */
export function ContentUnavailablePage({ what, detail }: { what?: string; detail?: string }) {
  return (
    <div className="mx-auto max-w-prose px-5 py-20 sm:px-8">
      <ContentUnavailable what={what} detail={detail} />
    </div>
  );
}
