import { Pic } from "../cld-image";
import { cn } from "@/lib/utils";
import {
  classifyLink,
  linkAttrs,
  relatedArrow,
  relatedCta,
  relatedKicker,
  type LinkPresentation,
} from "@/lib/links";

/**
 * A Link block, drawn two ways.
 *
 * `default` is the card this site has always had, unchanged in every visible
 * respect, because every Link block written before this feature is one and
 * they should not shift under the author.
 *
 * `related` is the editorial version: the card at the end of a journal entry
 * that says "and that was where Hilman Studio began", pointing at the project.
 * It is what turns a set of pages into an archive that refers to itself.
 *
 * ── why it looks like this ──
 *
 * The temptation with a card like this is a marketing CTA — a filled button,
 * a border-radius from a component library, a hover that lifts three ways at
 * once. That would be the wrong register entirely: this is a portfolio that
 * reads like a notebook, so the related card is built from the same parts as
 * everything around it. A hand-lettered kicker, a rule, a title in the display
 * face, and a call to action that is a line of text with an arrow rather than
 * a button pretending to be one.
 *
 * ── the anchor ──
 *
 * One `<a>` wrapping everything, so the whole card is the target on a phone
 * and there is exactly one thing in the tab order. Internal destinations stay
 * in the same tab; only genuinely external ones open a new one, and then with
 * `rel="noopener noreferrer"`. See lib/links.ts — the decision is made there,
 * once, rather than re-derived here.
 */
export function LinkCard({
  data,
  presentation,
}: {
  data: Record<string, any>;
  presentation: LinkPresentation;
}) {
  const target = classifyLink(data.url);

  // A link nobody can safely follow is not rendered as a link. Returning null
  // rather than an inert card means a `javascript:` URL that somehow reached
  // the database produces nothing at all, not a dead box.
  if (target.kind === "unsafe") return null;

  const attrs = linkAttrs(target);
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim() : data.url;

  if (presentation === "related") {
    const cta = relatedCta(data.url, data.label);
    return (
      <a
        href={target.href}
        {...attrs}
        className={cn(
          "!max-w-none group block rounded-md border border-line bg-surface shadow-card",
          "transition-all duration-base ease-out hover:-translate-y-0.5 hover:border-pen hover:shadow-lift",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
        )}
      >
        {/* Stacks on a phone, side by side once there is room. The image is
            second in the DOM but drawn first on a wide screen, so a card with
            no thumbnail simply has no column rather than a gap where one
            would have been. */}
        <div className="flex flex-col gap-0 sm:flex-row-reverse sm:items-stretch">
          {data.thumbnail && (
            <div className="relative shrink-0 overflow-hidden rounded-t-md sm:w-[38%] sm:rounded-l-none sm:rounded-r-md">
              <Pic
                src={data.thumbnail}
                alt=""
                width={800}
                height={600}
                sizes="(max-width: 640px) 100vw, 320px"
                className="h-40 w-full object-cover sm:h-full"
              />
            </div>
          )}

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <p className="font-hand text-base text-faint">{relatedKicker(data.url)}</p>

            <h3 className="mt-1 font-display text-xl font-semibold leading-snug text-ink transition-colors group-hover:text-pen">
              {title}
            </h3>

            {data.description && (
              <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-soft">
                {data.description}
              </p>
            )}

            <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-pen">
              {cta}
              <span aria-hidden className="transition-transform duration-base group-hover:translate-x-0.5">
                {relatedArrow(data.url)}
              </span>
            </p>
          </div>
        </div>
      </a>
    );
  }

  // The original card. Structurally identical to what it replaced — the only
  // change is that `target`/`rel` are now decided rather than hardcoded.
  return (
    <a
      href={target.href}
      {...attrs}
      className="group flex items-center gap-4 rounded-md border border-line bg-surface p-4 shadow-card transition-all duration-base ease-out hover:-translate-y-0.5 hover:shadow-lift"
    >
      {data.thumbnail && (
        <div className="hidden h-16 w-24 shrink-0 overflow-hidden rounded sm:block">
          <Pic src={data.thumbnail} alt="" width={192} height={128} className="h-full w-full object-cover" />
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-ink transition-colors group-hover:text-pen">
          {data.title ?? data.url}
        </p>
        {data.description && <p className="mt-0.5 line-clamp-2 text-sm text-soft">{data.description}</p>}
        <p className="mt-1 truncate text-xs text-faint">{data.url}</p>
      </div>
    </a>
  );
}
