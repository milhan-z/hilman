"use client";

import Link from "next/link";
import { useState } from "react";
import { QuickCreateSheet } from "./quick-create-sheet";

/**
 * Four ways to start, as four thumb-sized targets.
 *
 * The same four things the ✛ in the tab bar offers. Duplicating them here is
 * deliberate: the tab bar is for when you already know what you want, and this
 * is for the moment you open the app and are deciding. Both go through the
 * same sheet and the same editors — there is one implementation, shown twice.
 */

const TILE =
  "flex min-h-[68px] flex-col justify-center gap-0.5 rounded-lg border border-line bg-surface px-3.5 text-left shadow-card transition-[background-color,transform] duration-[120ms] hover:border-pen active:scale-[0.98] active:bg-card-hover";

export function QuickAddGrid() {
  const [noteOpen, setNoteOpen] = useState(false);

  return (
    <section aria-labelledby="quick-add-heading" className="space-y-2.5">
      <h2 id="quick-add-heading" className="font-mono text-2xs uppercase tracking-widest text-faint">
        Quick add
      </h2>
      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setNoteOpen(true)} className={TILE}>
          <span className="text-sm font-semibold text-ink">＋ Note</span>
          <span className="text-xs text-faint">Catch a thought</span>
        </button>
        <Link href="/admin/projects/new" prefetch={false} className={TILE}>
          <span className="text-sm font-semibold text-ink">＋ Project</span>
          <span className="text-xs text-faint">A case study</span>
        </Link>
        <Link href="/admin/journal/new" prefetch={false} className={TILE}>
          <span className="text-sm font-semibold text-ink">＋ Journal</span>
          <span className="text-xs text-faint">A full post</span>
        </Link>
        <Link href="/admin/media" prefetch={false} className={TILE}>
          <span className="text-sm font-semibold text-ink">＋ Photo</span>
          <span className="text-xs text-faint">Straight to the library</span>
        </Link>
      </div>

      <QuickCreateSheet open={noteOpen} onClose={() => setNoteOpen(false)} startWith="note" />
    </section>
  );
}
