"use client";

import { MobileSheet, SheetActions } from "../mobile-sheet";
import type { StarterFinding } from "@/lib/starter-prompts";

/**
 * The starter prompts that are still the template's questions.
 *
 * The gate that holds these back is right: a paragraph reading "What prompted
 * this note?" is an instruction to the author, and putting it on the public
 * site is the failure the gate exists to prevent. What was wrong was the
 * answer it gave — one sentence, naming a category rather than a place:
 *
 *     Replace the remaining starter-template instructions with your own story
 *     before publishing.
 *
 * On a phone, in a document of twenty blocks, that is unactionable. It does not
 * say how many, or which, or where, and the button underneath it said "Try
 * again", which was guaranteed not to work.
 *
 * So this shows them. Every prompt still unanswered, in document order, with
 * the two moves that actually resolve it: go to the first one and write, or
 * take the untouched ones out. Nothing is removed without being asked, and
 * nothing is published as a side effect of removing — the author returns to
 * the same Publish button they pressed.
 */

export interface StarterPromptsSheetProps {
  open: boolean;
  onClose: () => void;
  prompts: StarterFinding[];
  /** Jump to a block: close, scroll to it, mark it. */
  onShow: (finding: StarterFinding) => void;
  /** Take out every block still saying exactly what the template said. */
  onRemove: () => void;
  /** What pressing publish again would be called — "Publish" or "Update live". */
  publishLabel: string;
}

export function StarterPromptsSheet({
  open,
  onClose,
  prompts,
  onShow,
  onRemove,
  publishLabel,
}: StarterPromptsSheetProps) {
  const count = prompts.length;
  const subject = count === 1 ? "1 starter prompt" : `${count} starter prompts`;

  return (
    <MobileSheet
      open={open}
      onClose={onClose}
      title={`${subject} left`}
      subtitle="These are still the template's words"
      actions={
        <SheetActions
          cancelLabel="Keep writing"
          onCancel={onClose}
          confirmLabel={`Remove & ${publishLabel.toLowerCase()}`}
          onConfirm={onRemove}
        />
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-soft">
          {count === 1 ? "This paragraph is" : "These are"} still exactly what the starter put
          there, so {count === 1 ? "it" : "they"} would go on the site as {count === 1 ? "an" : ""}{" "}
          unanswered {count === 1 ? "question" : "questions"}. Write over{" "}
          {count === 1 ? "it" : "them"}, or take {count === 1 ? "it" : "them"} out.
        </p>

        <ul className="space-y-2">
          {prompts.map((finding) => (
            <li key={`${finding.index}-${finding.text}`}>
              <button
                type="button"
                onClick={() => onShow(finding)}
                className="flex w-full items-start gap-3 rounded-md border border-line bg-raise p-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
              >
                <span className="mt-0.5 shrink-0 font-mono text-2xs uppercase tracking-wide text-pen">
                  {finding.type}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-relaxed text-ink">
                    &ldquo;{finding.text}&rdquo;
                  </span>
                  <span className="mt-1 block text-xs text-faint">Show me this one</span>
                </span>
                <span aria-hidden className="shrink-0 self-center text-faint">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>

        <p className="rounded-md border border-line bg-raise p-3 text-xs leading-relaxed text-soft">
          Removing only takes out blocks that still say exactly what the template said. Anything
          you have written in stays, even if you kept the shape. Your draft on this device is not
          touched until you choose.
        </p>
      </div>
    </MobileSheet>
  );
}
