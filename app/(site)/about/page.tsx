import type { Metadata } from "next";
import { Pic } from "@/components/cld-image";
import { SectionReveal } from "@/components/motion";
import { Button, Marginalia, Tag } from "@/components/ui";
import { getPage } from "@/lib/data";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "About",
  description: "Who Hilman is, and how design, media, and tech ended up sharing one desk.",
};

export default async function AboutPage() {
  const page = await getPage("about");
  const d = page?.data ?? {};

  return (
    <div className="mx-auto max-w-content px-5 py-16 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        {/* story */}
        <div>
          <p className="font-hand text-xl text-faint">the person behind the filing system</p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">About</h1>
          {d.lede && <p className="mt-6 text-xl leading-relaxed">{d.lede}</p>}
          <div className="mt-6 space-y-5 text-lg leading-relaxed text-soft">
            {(d.story ?? []).map((para: string, i: number) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {/* timeline */}
          {d.timeline && (
            <SectionReveal>
              <section className="mt-14" aria-label="Loose timeline">
                <h2 className="font-display text-xl font-semibold">A loose timeline</h2>
                <ol className="mt-6 space-y-0 border-l-2 border-line pl-6">
                  {d.timeline.map((item: { year: string; text: string }, i: number) => (
                    <li key={i} className="relative pb-7 last:pb-0">
                      <span
                        aria-hidden
                        className="absolute -left-[31px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-paper bg-pen"
                      />
                      <span className="font-hand text-lg text-pen">{item.year}</span>
                      <p className="mt-0.5 text-soft">{item.text}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </SectionReveal>
          )}
        </div>

        {/* sidebar */}
        <aside className="space-y-8 lg:pt-24">
          {d.portrait && (
            <figure className="relative rotate-1">
              <div className="overflow-hidden rounded-lg border-8 border-raise shadow-lift">
                <Pic src={d.portrait} alt="Portrait of Hilman" width={900} height={1100} sizes="(max-width: 1024px) 100vw, 400px" />
              </div>
              <Marginalia className="absolute -bottom-4 right-4 rotate-2">
                that’s me, mid-idea
              </Marginalia>
            </figure>
          )}

          {d.toolbox && (
            <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">In the toolbox</h2>
              <div className="mt-4 flex flex-wrap gap-2">
                {d.toolbox.map((tool: string) => (
                  <Tag key={tool}>{tool}</Tag>
                ))}
              </div>
            </div>
          )}

          {d.currently && (
            <div className="ruled rounded-lg border border-line bg-raise p-6 shadow-card">
              <h2 className="text-xs font-medium uppercase tracking-wider text-faint">Currently</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-soft">
                {d.currently.map((c: string, i: number) => (
                  <li key={i} className="flex gap-2.5">
                    <span aria-hidden className="text-pen">
                      ✶
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="text-center lg:text-left">
            <Button href="/connect">Say hello properly</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
