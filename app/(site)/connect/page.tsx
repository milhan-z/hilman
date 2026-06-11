import type { Metadata } from "next";
import { ConnectForm } from "@/components/connect-form";
import { Marginalia } from "@/components/ui";
import { getPage, getSettings } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Connect",
  description: "Start a conversation with Hilman — projects, collaborations, or just a good link.",
};

export default async function ConnectPage() {
  const [page, settings] = await Promise.all([getPage("connect"), getSettings()]);
  const d = page?.data ?? {};

  return (
    <div className="mx-auto max-w-content px-5 py-16 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <header>
          <p className="font-hand text-xl text-faint">the inbox is open</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Connect</h1>
          {d.lede && <p className="mt-5 text-lg text-soft">{d.lede}</p>}
          {d.availability && (
            <div className="relative mt-8 rounded-lg border border-line bg-surface p-5 shadow-card">
              <span className="absolute -top-2.5 left-4 rounded-sm bg-hl px-2 py-0.5 font-hand text-base text-hl-ink">
                availability
              </span>
              <p className="text-sm leading-relaxed text-soft">{d.availability}</p>
            </div>
          )}
          {d.note && <Marginalia className="mt-6 block -rotate-1">{d.note}</Marginalia>}

          <nav aria-label="Elsewhere" className="mt-10">
            <h2 className="text-xs font-medium uppercase tracking-wider text-faint">Elsewhere</h2>
            <ul className="mt-3 space-y-2">
              {settings.socials.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-pen underline-offset-4 hover:underline"
                  >
                    {s.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="rounded-xl border border-line bg-surface p-7 shadow-card sm:p-9">
          <ConnectForm />
        </div>
      </div>
    </div>
  );
}
