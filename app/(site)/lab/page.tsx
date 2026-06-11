import type { Metadata } from "next";
import Link from "next/link";
import { CustomBlock } from "@/components/lab/registry";
import { SectionReveal } from "@/components/motion";

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
    note: "A ruled page with this site's three tools: ink pen, highlighter, red pen. Draw something.",
    marginalia: "stylus works too",
  },
];

export default function LabPage() {
  return (
    <div className="mx-auto max-w-content px-5 py-16 sm:px-8">
      <header className="max-w-2xl">
        <p className="font-hand text-xl text-faint">please touch the exhibits</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">Lab</h1>
        <p className="mt-4 text-lg text-soft">
          Small interactive experiments — sketches in code rather than ink. Unlike the{" "}
          <Link href="/works?stream=digital-lab" className="text-pen underline underline-offset-4">
            Digital Lab stream
          </Link>{" "}
          (finished projects), everything here is live and a little unfinished on purpose.
        </p>
      </header>

      <div className="mt-14 space-y-16">
        {experiments.map((exp, i) => (
          <SectionReveal key={exp.component}>
            <section aria-labelledby={`exp-${i}`}>
              <div className="mb-4 flex flex-wrap items-baseline gap-3">
                <span className="font-hand text-lg text-faint" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 id={`exp-${i}`} className="font-display text-xl font-semibold">
                  {exp.title}
                </h2>
                <span className="hidden font-hand text-lg text-red sm:inline">{exp.marginalia}</span>
              </div>
              <p className="mb-5 max-w-xl text-soft">{exp.note}</p>
              <CustomBlock component={exp.component} />
            </section>
          </SectionReveal>
        ))}
      </div>
    </div>
  );
}
