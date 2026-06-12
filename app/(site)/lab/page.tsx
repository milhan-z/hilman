import type { Metadata } from "next";
import Link from "next/link";
import { DrawAccent } from "@/components/draw-accent";
import { CustomBlock } from "@/components/lab/registry";
import { SectionReveal } from "@/components/motion";
import { Kicker, Marginalia } from "@/components/ui";

export const metadata: Metadata = {
  title: "Lab",
  description: "Hilman's playground — small interactive experiments you can actually play with.",
};

const experiments = [
  {
    component: "ink-field",
    title: "Ink Field",
    note: "A flow field drawn like ink soaking into paper. Your cursor stirs it.",
    marginalia: "no two runs look the same",
  },
  {
    component: "doodle-pad",
    title: "Doodle Pad",
    note: "A ruled page with this site’s three tools: ink pen, highlighter, red pen. Draw something.",
    marginalia: "stylus works too",
  },
];

export default function LabPage() {
  return (
    <div className="mx-auto max-w-wide px-5 py-14 sm:px-8">
      <header className="max-w-2xl">
        <Kicker>please touch the exhibits</Kicker>
        <div className="relative mt-3 inline-block">
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Lab</h1>
          <div className="absolute -bottom-2 left-0">
            <DrawAccent variant="circle" color="cyan" width={120} strokeWidth={3} />
          </div>
        </div>
        <p className="mt-4 text-lg text-pretty leading-relaxed text-soft">
          Small interactive experiments — sketches in code rather than ink. Unlike the{" "}
          <Link href="/works?stream=digital-lab" className="text-pen underline underline-offset-4">
            Digital Lab stream
          </Link>{" "}
          (finished projects), everything here is live and a little unfinished on purpose.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {experiments.map((exp, i) => (
          <SectionReveal key={exp.component}>
            <section aria-labelledby={`exp-${i}`} className="overflow-hidden rounded-md border border-line-strong bg-surface shadow-card">
              {/* exhibit label */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-2xs font-semibold text-pen tnum">
                    EXP.{String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`exp-${i}`} className="font-display text-lg font-semibold tracking-tight">
                    {exp.title}
                  </h2>
                </div>
                <Marginalia className="-rotate-1 text-base">{exp.marginalia}</Marginalia>
              </div>
              <div className="graphpaper p-4 sm:p-6">
                <p className="mb-4 max-w-xl text-sm text-soft">{exp.note}</p>
                <CustomBlock component={exp.component} />
              </div>
            </section>
          </SectionReveal>
        ))}
      </div>
    </div>
  );
}
