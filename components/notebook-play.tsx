"use client";

import { useState } from "react";
import { NotebookMoment } from "./bits/notebook-moment";
import { useReducedMotion } from "./use-reduced-motion";

const ideas = [
  { name: "Design", src: "/lottie/play-design.json", caption: "A different way to look at it." },
  { name: "Motion", src: "/lottie/play-motion.json", caption: "A little movement changes the story." },
  { name: "Code", src: "/lottie/play-code.json", caption: "An idea you can interact with." },
] as const;

/** A keyboard-accessible experiment; navigation never requires a gesture. */
export function NotebookPlay() {
  const [active, setActive] = useState(0);
  const [replay, setReplay] = useState(0);
  const reduced = useReducedMotion();
  const idea = ideas[active];
  return <div className="overflow-hidden rounded-lg border border-line bg-surface">
    <div className="dotgrid flex min-h-[266px] flex-col items-center justify-center px-5 pb-6 pt-2">
      <NotebookMoment key={`${idea.name}-${replay}`} src={idea.src} stillFrame="last" size={224} playOn="view" />
      <p className="text-center text-sm text-soft" aria-live="polite" aria-atomic="true">{idea.caption}</p>
    </div>
    <div className="flex items-center gap-1 border-t border-line p-2" role="group" aria-label="Try a different creative mode">
      {ideas.map((item, index) => <button key={item.name} type="button" aria-pressed={active === index} onClick={() => setActive(index)} className={`notebook-choice min-h-11 flex-1 rounded px-3 py-2 text-sm font-medium ${active === index ? "bg-hl text-hl-ink" : "text-soft"}`}>{item.name}</button>)}
      <button type="button" onClick={() => { if (!reduced) setReplay((value) => value + 1); }} aria-disabled={reduced} aria-label={reduced ? "Replay unavailable with reduced motion" : `Replay ${idea.name.toLowerCase()} animation`} title={reduced ? "Reduced motion is on" : "Play again"} className="notebook-choice notebook-replay flex h-11 w-11 shrink-0 items-center justify-center rounded border-l border-line text-soft">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg>
      </button>
    </div>
  </div>;
}
