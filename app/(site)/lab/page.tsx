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
    // What the exhibit demonstrates, and how to actually use it. A canvas that
    // only responds to a mouse needs to say so rather than look broken.
    shows: "Canvas rendering, particle simulation, and reduced-motion handling.",
    controls: [
      "Mouse or trackpad: move the pointer across the field to stir it.",
      "Touch: drag a finger across the canvas.",
      "Keyboard: nothing to operate — the field animates on its own, and holds still if you have reduced motion enabled.",
    ],
  },
  {
    component: "doodle-pad",
    title: "Doodle Pad",
    note: "A ruled page with this site’s three tools: ink pen, highlighter, red pen. Draw something.",
    marginalia: "stylus works too",
    shows: "Pointer-event handling across mouse, touch and stylus, plus canvas state.",
    controls: [
      "Mouse, touch or stylus: drag on the page to draw.",
      "Keyboard: Tab to the pen buttons and press Enter or Space to switch tool or clear. Drawing itself needs a pointer.",
    ],
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
          Little ideas you can play with. A place to follow my curiosity, try something,
          and see what happens. You’ll find finished projects in{" "}
          <Link href="/works?stream=digital-lab" className="text-pen underline underline-offset-4">
            Code
          </Link>{" "}
          . Everything here is an experiment.
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {experiments.map((exp, i) => (
          <SectionReveal key={exp.component}>
            <section aria-labelledby={`exp-${i}`} className="overflow-hidden rounded-md border border-line-strong bg-surface shadow-card">
              {/* exhibit label */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs font-semibold text-pen tnum">
                    EXP.{String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 id={`exp-${i}`} className="font-display text-lg font-semibold tracking-tight">
                    {exp.title}
                  </h2>
                </div>
                <Marginalia className="-rotate-1 text-base">{exp.marginalia}</Marginalia>
              </div>
              <div className="graphpaper p-4 sm:p-6">
                <p className="max-w-xl text-sm text-soft">{exp.note}</p>
                <p className="mt-1.5 max-w-xl text-sm text-soft">
                  <span className="font-medium text-ink">What it shows: </span>
                  {exp.shows}
                </p>
                <details className="group mt-3 max-w-xl">
                  <summary className="cursor-pointer text-sm text-pen underline-offset-4 hover:underline">
                    How to use it
                  </summary>
                  <ul className="mt-2 space-y-1.5 text-sm text-soft">
                    {exp.controls.map((c) => (
                      <li key={c} className="flex gap-2">
                        <span aria-hidden className="text-pen">
                          &rarr;
                        </span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="mt-4">
                  <CustomBlock component={exp.component} />
                </div>
              </div>
            </section>
          </SectionReveal>
        ))}
      </div>
    </div>
  );
}
