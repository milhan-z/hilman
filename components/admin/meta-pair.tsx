"use client";

import { useState } from "react";

/**
 * One editable line of a project's metadata.
 *
 * ── why this keeps its own copy of the text ──
 *
 * `tools` is stored as an array and shown as a string, so the value handed
 * back down is `split(",")`, trimmed, emptied-out, and `join(", ")`d again.
 * Fully controlled, that round trip fights the typist: type "Figma," and the
 * split gives ["Figma", ""], the empty is dropped, and the comma you just
 * pressed is deleted before you can type the next letter. A second tool could
 * never be entered at all.
 *
 * So while the field has focus, what was typed wins over what the document
 * thinks it means. The array is still written on every keystroke — nothing is
 * deferred or lost — it is only the *display* that stops being re-derived
 * mid-word. On blur the canonical form comes back, so "Figma,  riso ," tidies
 * itself up to "Figma, riso" the moment you look away.
 */
export function MetaPair({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div>
      <dt className="font-hand text-sm text-faint">{label}</dt>
      <dd className="mt-0.5">
        <input
          type="text"
          value={draft ?? value}
          onChange={(event) => {
            setDraft(event.target.value);
            onChange(event.target.value);
          }}
          onBlur={() => setDraft(null)}
          placeholder={placeholder}
          // 16px floor: Safari zooms the whole page into any smaller field.
          className="min-h-11 w-full border-0 border-b border-dashed border-transparent bg-transparent p-0 text-base font-medium text-ink outline-none transition-colors hover:border-line focus:border-pen sm:min-h-0 sm:text-xs"
        />
      </dd>
    </div>
  );
}
