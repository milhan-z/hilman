"use client";

import { useMemo, useState } from "react";
import { reviewStudioHtml } from "@/lib/studio-html";
import { cn } from "@/lib/utils";

/**
 * Writing markup by hand, on a phone.
 *
 * Deliberately a textarea. A real code editor — Monaco, CodeMirror — brings a
 * virtualised scroller, its own key handling and several hundred kilobytes,
 * and then fights the iOS keyboard for the bottom third of the screen. A
 * monospace textarea has native undo, native selection, native autocorrect
 * controls and native scrolling, and it is the one control iOS already knows
 * how to put a keyboard under.
 *
 * Two modes rather than a split view: at 390px a side-by-side editor and
 * preview gives you two unusable halves. Code is where you type, Preview is
 * what the page will actually show — and Preview renders the *sanitised*
 * markup, not the raw text, so what you check is what gets stored.
 */

export function HtmlBlockEditor({
  value,
  onChange,
  /** The full-height sheet turns this on; inline in a block it stays compact. */
  tall = false,
}: {
  value: string;
  onChange: (html: string) => void;
  tall?: boolean;
}) {
  const [mode, setMode] = useState<"code" | "preview">("code");
  const review = useMemo(() => reviewStudioHtml(value), [value]);

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="Custom HTML" className="flex gap-1.5">
        {(["code", "preview"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={mode === option}
            onClick={() => setMode(option)}
            className={cn(
              "min-h-11 rounded-md border px-4 text-sm font-medium capitalize transition-colors",
              mode === option
                ? "border-hl bg-hl-soft text-ink"
                : "border-line bg-raise text-soft"
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {mode === "code" ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          // autocorrect and capitalisation turn `<div>` into `<Div>` and
          // straight quotes into curly ones, which is the difference between
          // markup and a syntax error.
          placeholder={'<section class="…">\n  …\n</section>'}
          rows={tall ? 20 : 8}
          className={cn(
            "w-full rounded-md border border-line bg-raise p-3 font-mono outline-none transition-colors focus:border-pen",
            // 16px: anything smaller and Safari zooms the page on focus, which
            // in a code field means you lose the line you were editing.
            "text-base leading-relaxed",
            // Long lines scroll inside the box instead of widening the page.
            "whitespace-pre overflow-x-auto"
          )}
        />
      ) : (
        <div className="rounded-md border border-line bg-surface p-3">
          {review.html.trim() ? (
            // Sanitised immediately above, by the same function the public
            // renderer and the sync endpoint use. The preview is never shown
            // the raw text.
            <div
              className="prose-h max-w-none"
              dangerouslySetInnerHTML={{ __html: review.html }}
            />
          ) : (
            <p className="py-6 text-center text-sm text-faint">
              Nothing to show yet.
            </p>
          )}
        </div>
      )}

      {review.removed.length > 0 && (
        <ul role="status" className="space-y-1 rounded-md border border-hl/50 bg-hl-soft/15 p-3">
          {review.removed.map((note) => (
            <li key={note} className="text-xs leading-relaxed text-soft">
              {note}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-faint">
        Saved with the rest of the document — nothing here reaches the public site until you
        publish.
      </p>
    </div>
  );
}
