"use client";

import { useState } from "react";

const ideas = [
  { name: "Design", glyph: "Aa", caption: "A different way to look at it.", className: "play-design" },
  { name: "Motion", glyph: "↗", caption: "A little movement changes the story.", className: "play-motion" },
  { name: "Code", glyph: "{ }", caption: "An idea you can interact with.", className: "play-code" },
];

/** A keyboard-accessible experiment; navigation never requires a gesture. */
export function NotebookPlay() {
  const [active, setActive] = useState(0);
  const idea = ideas[active];
  return <div className="overflow-hidden rounded-lg border border-line bg-surface">
    <div className="dotgrid flex min-h-[205px] flex-col items-center justify-center gap-5 px-5 py-7">
      <span key={idea.name} aria-hidden className={`play-glyph font-display text-7xl leading-none text-pen ${idea.className}`}>{idea.glyph}</span>
      <p className="text-center text-sm text-soft" aria-live="polite" aria-atomic="true">{idea.caption}</p>
    </div>
    <div className="flex items-center gap-1 border-t border-line p-2" role="group" aria-label="Try a different creative mode">
      {ideas.map((item, index) => <button key={item.name} type="button" aria-pressed={active === index} onClick={() => setActive(index)} className={`min-h-11 flex-1 rounded px-3 py-2 text-sm font-medium transition-colors ${active === index ? "bg-hl text-hl-ink" : "text-soft hover:bg-raise hover:text-ink"}`}>{item.name}</button>)}
    </div>
  </div>;
}
