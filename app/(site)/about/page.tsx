import type { Metadata } from "next";
import { Pic } from "@/components/cld-image";
import { DrawAccent } from "@/components/draw-accent";
import { SectionReveal } from "@/components/motion";
import { Button, EntryMeta, Kicker, Marginalia, Tag } from "@/components/ui";
import { getPage, getSettings } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About",
  description: "Who Hilman is, and how design, media, and tech ended up sharing one desk.",
};

export default async function AboutPage() {
  const [page, settings] = await Promise.all([getPage("about"), getSettings()]);
  const d = page?.data ?? {};

  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
      <header className="max-w-2xl">
        <Kicker>the person behind the filing system</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">About</h1>
          <div className="absolute -bottom-1 left-0">
            <DrawAccent variant="underline" color="yellow" width={130} strokeWidth={4} />
          </div>
        </div>
        <EntryMeta className="mt-5" items={settings.hero_roles} />
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        {/* story */}
        <div>
          {d.lede && <p className="text-pretty text-2xl font-medium leading-snug">{d.lede}</p>}
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-soft">
            {(d.story ?? []).map((para: string, i: number) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {/* timeline spine */}
          {d.timeline && (
            <SectionReveal>
              <section className="mt-14" aria-label="Loose timeline">
                <h2 className="rule-baseline font-mono text-2xs uppercase tracking-[0.2em] text-faint">
                  A loose timeline
                </h2>
                <ol className="mt-6 space-y-0 border-l-2 border-line pl-6">
                  {d.timeline.map((item: { year: string; text: string }, i: number) => (
                    <li key={i} className="relative pb-7 last:pb-0">
                      <span
                        aria-hidden
                        className="absolute -left-[31px] top-1 h-3 w-3 rounded-[2px] border-2 border-paper bg-pen"
                      />
                      <span className="font-mono text-sm font-semibold text-pen tnum">{item.year}</span>
                      <p className="mt-1 text-soft">{item.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </SectionReveal>
          )}
        </div>

        {/* sidebar */}
        <aside className="space-y-8 lg:pt-2">
          {d.portrait && (
            <figure className="relative mx-auto max-w-xs rotate-1.5">
              {/* tape */}
              <span aria-hidden className="absolute -top-3 left-1/2 z-10 h-6 w-20 -translate-x-1/2 -rotate-2 bg-hl-soft" />
              <div className="overflow-hidden rounded-sm border-[6px] border-raise shadow-lift">
                <Pic
                  src={d.portrait}
                  alt="Portrait of Hilman"
                  width={900}
                  height={1100}
                  sizes="(max-width: 1024px) 80vw, 360px"
                />
              </div>
              <Marginalia className="absolute -bottom-4 right-3 rotate-2">that’s me, mid-idea</Marginalia>
            </figure>
          )}

          {d.toolbox && (
            <div className="rounded-md border border-line bg-surface p-6 shadow-card">
              <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">In the toolbox</h2>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {d.toolbox.map((tool: string) => (
                  <Tag key={tool}>{tool}</Tag>
                ))}
              </div>
            </div>
          )}

          {d.currently && (
            <div className="ruled rounded-md border border-line bg-raise p-6 shadow-card">
              <h2 className="font-mono text-2xs uppercase tracking-widest text-faint">Currently</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-soft">
                {d.currently.map((c: string, i: number) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="text-pen">→</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button href="/connect" className="w-full">
            Say hello properly
          </Button>
        </aside>
      </div>
    </div>
  );
}
