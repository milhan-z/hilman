import Link from "next/link";
import type { Settings } from "@/lib/types";

export function SiteFooter({ settings, blurb, based }: { settings: Settings; blurb?: string; based?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-line-strong">
      <div className="mx-auto max-w-wide px-5 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          {/* identity */}
          <div>
            <p className="flex items-baseline gap-0.5 font-display text-2xl font-bold">
              Hilman
              <span className="text-pen">.</span>
            </p>
            {blurb && (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-soft">{blurb}</p>
            )}
            {based && <p className="mt-2 text-sm text-soft">{based}</p>}
            <p className="mt-5 font-hand text-xl text-pen">Thanks for stopping by.</p>
          </div>

          {/* index */}
          <nav aria-label="Site index">
            <h2 className="font-mono text-xs uppercase tracking-widest text-soft">Explore</h2>
            {/* A footer link is still a link somebody taps. At 22px tall these
                were half the size a thumb needs, so each row carries its own
                height on a phone and reverts to a compact list once there is a
                pointer. The visual spacing barely moves — the target does. */}
            <ul className="mt-3 sm:mt-4 sm:space-y-1.5">
              {settings.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex min-h-11 items-center gap-2 text-sm text-soft transition-colors hover:text-pen sm:min-h-0 sm:items-baseline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* elsewhere — hidden until real accounts exist in Settings */}
          <nav aria-label="Social links" hidden={settings.socials.length === 0}>
            <h2 className="font-mono text-xs uppercase tracking-widest text-soft">Elsewhere</h2>
            <ul className="mt-3 sm:mt-4 sm:space-y-1.5">
              {settings.socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 items-center text-sm text-soft underline-offset-4 transition-colors hover:text-pen hover:underline sm:min-h-0"
                  >
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-6">
          <p className="font-mono text-xs uppercase tracking-wider text-soft">
            © {year} Hilman · Made with curiosity
          </p>
          <Link
            href="/admin"
            className="font-mono text-xs uppercase tracking-wider text-soft transition-colors hover:text-pen"
          >
            Studio ↗
          </Link>
        </div>
      </div>
    </footer>
  );
}
