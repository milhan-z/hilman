import { ImagePeek } from "./bits/image-peek";
import { PaperCard } from "./bits/paper-card";

type Item = { href: string; title: string; kicker?: string; image?: string | null } | null;

/**
 * Sequential entry navigation for detail pages — flip to the previous/next
 * page. Each is a card lifted off the desk (PaperCard), and where the page it
 * leads to has a photograph, that photograph peeks out from behind it
 * (ImagePeek) on the side the arrow points to.
 */
export function PrevNext({ prev, next, label = "entry" }: { prev: Item; next: Item; label?: string }) {
  if (!prev && !next) return null;
  return (
    <nav aria-label={`Adjacent ${label} navigation`} className="grid gap-3 sm:grid-cols-2">
      {prev ? (
        <PaperCard
          href={prev.href}
          seed={prev.href}
          lift="sm"
          className="group flex flex-col rounded-md border border-line bg-surface p-5 hover:border-line-strong"
        >
          <ImagePeek src={prev.image} side="left" />
          <span className="flex items-center gap-1.5 font-mono text-2xs uppercase tracking-widest text-faint">
            <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">←</span>
            Previous {prev.kicker ?? label}
          </span>
          <span className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-pen">
            {prev.title}
          </span>
        </PaperCard>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <PaperCard
          href={next.href}
          seed={next.href}
          lift="sm"
          className="group flex flex-col rounded-md border border-line bg-surface p-5 text-right hover:border-line-strong"
        >
          <ImagePeek src={next.image} side="right" />
          <span className="flex items-center justify-end gap-1.5 font-mono text-2xs uppercase tracking-widest text-faint">
            Next {next.kicker ?? label}
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
          </span>
          <span className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-pen">
            {next.title}
          </span>
        </PaperCard>
      ) : (
        <span className="hidden sm:block" />
      )}
    </nav>
  );
}
