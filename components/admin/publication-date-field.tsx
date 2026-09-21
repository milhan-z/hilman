"use client";

import { Field, TextInput } from "./fields";
import { publicationDateChanged, type EditorDoc, type EditorPatch } from "./editor-doc";
import { authorDateInput, formatDate, isoFromAuthorDate } from "@/lib/dates";

/**
 * The one publication-date control, used by both the phone and the desktop.
 *
 * It lived only in the mobile metadata sheet, so the same document had an
 * editorial capability on one screen and not the other. One component rather
 * than two, because the interesting part is not the input — it is knowing what
 * the current state of it actually means, and that must not be worked out
 * twice.
 *
 * ── what the copy has to be honest about ──
 *
 * The old control had a "Clear" button. Emptying the field sends nothing, and
 * sending nothing means the database keeps the date it already has — so the
 * button labelled Clear cleared precisely nothing, and an author using it to
 * un-date a published entry would have been told a flat untruth.
 *
 * Clearing a stored date is not implemented, because nothing has defined what
 * it should mean: a published entry with no publication date is a state the
 * public pages have no rendering for. So the control says what it does. When
 * there is a stored date, the button is a Reset that puts the picker back to
 * it. When there is not, the field is simply empty and the hint explains that
 * the site will date it on first publish.
 */
export function PublicationDateField({
  doc,
  patch,
}: {
  doc: EditorDoc;
  patch: EditorPatch;
}) {
  const stored = authorDateInput(doc.publishedAt);
  const changed = publicationDateChanged(doc);

  const hint = changed
    ? `Will publish as ${formatDate(isoFromAuthorDate(doc.publishedOn))}`
    : stored
      ? `Published ${formatDate(doc.publishedAt)}. Pick another day to move it.`
      : "Leave empty and the site dates it the day you first publish it.";

  return (
    <Field label="Publication date" hint={hint}>
      <div className="flex gap-2">
        <TextInput
          type="date"
          value={doc.publishedOn}
          onChange={(event) => patch({ publishedOn: event.target.value })}
        />
        {changed && (
          <button
            type="button"
            onClick={() => patch({ publishedOn: stored })}
            className="min-h-12 shrink-0 rounded border border-line px-3 text-sm text-soft transition-colors hover:border-pen hover:text-pen"
          >
            {stored ? "Reset" : "Clear"}
          </button>
        )}
      </div>
    </Field>
  );
}
