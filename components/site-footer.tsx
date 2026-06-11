import Link from "next/link";
import type { Settings } from "@/lib/types";

export function SiteFooter({ settings }: { settings: Settings }) {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto max-w-content px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-display text-xl font-bold">
              Hilman<span className="text-pen">.</span>
            </p>
            <p className="mt-2 max-w-sm text-sm text-soft">
              A living creative archive — design, stories, and code, filed loosely on purpose.
            </p>
            <p className="mt-3 font-hand text-lg text-faint">last updated whenever inspiration hit</p>
          </div>
          <nav aria-label="Social links" className="flex flex-wrap gap-x-5 gap-y-2">
            {settings.socials.map((s) => (
              <a
                key={s.label}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-soft underline-offset-4 transition-colors duration-fast hover:text-pen hover:underline"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-6 text-xs text-faint">
          <span>© {new Date().getFullYear()} Hilman. Archived with care.</span>
          <Link href="/admin" className="transition-colors hover:text-pen">
            studio door →
          </Link>
        </div>
      </div>
    </footer>
  );
}
