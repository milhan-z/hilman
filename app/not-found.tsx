import Link from "next/link";
import { NotebookMoment } from "@/components/bits/notebook-moment";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * The page for a URL the notebook does not have.
 *
 * It renders outside the site layout — there is no header or footer here — so
 * the only way on used to be the one button back to the cover. Somebody who
 * followed an old link to a project usually wants the projects, not the home
 * page, so the main sections are offered as well.
 *
 * Next renders this file in two ways. For a URL with no route at all it is
 * the page itself, and gets a page's props. But a copy of it, finished, is
 * also sent inside every other page, ready for the moment that page calls
 * notFound() — and a client component in that copy is downloaded by every
 * page whether it is ever shown or not. Measured: the card from the drawer
 * in that copy put 4.5 KB of gzipped JavaScript on Home, Works, Journal,
 * About and the Lab (the component, and a second copy of the link code with
 * it). So the card is only drawn where this is the page; a missing work or
 * journal entry gets the same page without it.
 */
export default function NotFound({ params }: { params?: Promise<unknown> }) {
  const isPage = params !== undefined;
  return (
    <div className="dotgrid flex min-h-screen flex-col items-center justify-center px-5 py-16 text-center">
      {/* The card pulled from the drawer, drawn on the notebook's cream paper
          (light in either theme). At most 70% of a phone's width, so the
          title below stays on the first screen. */}
      {isPage && (
        <div className="portrait-paper mb-8 max-w-full">
          <NotebookMoment src="/lottie/page-not-filed.json" stillFrame="last" size={240} playOn="view" className="max-w-[70vw]" />
        </div>
      )}
      <p className="font-mono text-2xs uppercase tracking-[0.3em] text-faint">Error 404 / page not filed</p>
      <p className="mt-5 font-hand text-2xl text-faint">flipped through every page…</p>
      <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">
        This one isn’t in the archive
        <span aria-hidden className="ml-1.5 inline-block h-3 w-3 rounded-[2px] bg-red align-middle" />
      </h1>
      <p className="mt-4 max-w-md text-soft">
        Either it was never filed, or it’s been quietly torn out. The rest of the notebook is intact.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-[44px] items-center rounded-md bg-hl px-5 py-2.5 text-sm font-medium text-hl-ink shadow-card transition-all hover:brightness-95 hover:shadow-glow active:translate-y-px"
      >
        Back to the first page →
      </Link>
      <nav aria-label="Other sections" className="mt-8">
        <p className="font-hand text-lg text-faint">or open another section —</p>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-1 gap-y-1">
          {DEFAULT_SETTINGS.nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="inline-flex min-h-11 items-center rounded px-3 text-sm font-medium text-pen underline-offset-4 hover:underline"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
