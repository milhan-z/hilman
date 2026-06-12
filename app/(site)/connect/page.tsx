import type { Metadata } from "next";
import { ConnectForm } from "@/components/connect-form";
import { DrawAccent } from "@/components/draw-accent";
import { Kicker, Marginalia, Stamp } from "@/components/ui";
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
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr]">
        <header>
          <Kicker>the inbox is open</Kicker>
          <div className="relative mt-3 inline-block">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Connect</h1>
            <div className="absolute -bottom-1 left-0">
              <DrawAccent variant="underline2" color="yellow" width={150} strokeWidth={4} />
            </div>
          </div>
          {d.lede && <p className="mt-5 text-lg text-pretty leading-relaxed text-soft">{d.lede}</p>}

          {d.availability && (
            <div className="relative mt-8 rounded-md border border-line bg-surface p-5 pt-6 shadow-card">
              <span className="absolute -top-3 left-4">
                <Stamp tone="hl">availability</Stamp>
              </span>
              <p className="text-sm leading-relaxed text-soft">{d.availability}</p>
            </div>
          )}

          {d.note && <Marginalia className="mt-6 block -rotate-1">{d.note}</Marginalia>}

          <nav aria-label="Elsewhere" className="mt-10">
            <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">Elsewhere</h2>
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

        <div className="rounded-md border border-line bg-surface p-7 shadow-card sm:p-9">
          <ConnectForm />
        </div>
      </div>
    </div>
  );
}
