import Link from "next/link";

type Item = { href: string; title: string; kicker?: string } | null;

/** Sequential entry navigation for detail pages — flip to the previous/next page. */
export function PrevNext({ prev, next, label = "entry" }: { prev: Item; next: Item; label?: string }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label={`Adjacent ${label} navigation`} className="grid gap-3 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col rounded-md border border-line bg-surface p-5 transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
        >
          <span className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest text-faint">
            <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
            Previous {prev.kicker ?? label}
          </span>
          <span className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-pen">
            {prev.title}
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col rounded-md border border-line bg-surface p-5 text-right transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
        >
          <span className="flex items-center justify-end gap-1.5 font-mono text-2xs uppercase tracking-widest text-faint">
            Next {next.kicker ?? label}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
          <span className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-pen">
            {next.title}
          </span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
    </nav>
  );
}
