import Link from "next/link";
import { EntryMeta } from "./ui";
import type { Settings } from "@/lib/types";

const SECTION_NUM: Record<string, string> = {
  "/works": "01",
  "/journal": "02",
  "/lab": "03",
  "/about": "04",
  "/connect": "05",
};

export function SiteFooter({ settings }: { settings: Settings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-28 border-t-2 border-ink/85">
      {/* ledger strip, mirroring the masthead */}
      <div className="border-b border-line">
        <div className="mx-auto max-w-wide px-5 py-1.5 sm:px-8">
          <EntryMeta items={["Colophon", "Hilman.", `Edition ${year}`, "Surabaya, ID"]} />
        </div>
      </div>

      <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* identity */}
          <div>
            <p className="flex items-baseline gap-0.5 font-display text-2xl font-bold">
              Hilman
              <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-[1px] bg-red" />
            </p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-soft">
              A living creative archive — design, stories, and code, filed loosely on purpose by an
              Informatics student who refuses to pick one lane.
            </p>
            <p className="mt-4 font-hand text-lg text-faint">
              last updated whenever inspiration hit
            </p>
          </div>

          {/* index */}
          <nav aria-label="Site index">
            <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">Index</h2>
            <ul className="mt-4 space-y-1.5">
              {settings.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex items-baseline gap-2 text-sm text-soft transition-colors hover:text-pen"
                  >
                    <span className="font-mono text-2xs text-faint tnum group-hover:text-pen">
                      {SECTION_NUM[item.href] ?? "··"}
                    </span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* elsewhere */}
          <nav aria-label="Social links">
            <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">Elsewhere</h2>
            <ul className="mt-4 space-y-1.5">
              {settings.socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-soft underline-offset-4 transition-colors hover:text-pen hover:underline"
                  >
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-6">
          <p className="font-mono text-2xs uppercase tracking-wider text-faint">
            © {year} Hilman · Set in Fraunces &amp; Inter · Archived with care
          </p>
          <Link
            href="/admin"
            className="font-mono text-2xs uppercase tracking-wider text-faint transition-colors hover:text-pen"
          >
            studio door →
          </Link>
        </div>
      </div>
    </footer>
  );
}
