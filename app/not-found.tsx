import Link from "next/link";
import { DEFAULT_SETTINGS } from "@/lib/types";

/**
 * The page for a URL the notebook does not have.
 *
 * It renders outside the site layout — there is no header or footer here — so
 * the only way on used to be the one button back to the cover. Somebody who
 * followed an old link to a project usually wants the projects, not the home
 * page, so the main sections are offered as well.
 */
export default function NotFound() {
  return (
    <div className="dotgrid flex min-h-screen flex-col items-center justify-center px-5 py-16 text-center">
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
