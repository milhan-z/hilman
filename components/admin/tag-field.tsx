"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { inputCls } from "./fields";
import type { EditorDoc, EditorPatch } from "./editor-doc";
import {
  cleanTagName,
  MAX_TAGS,
  readTagInput,
  sameTags,
  tagInputText,
  tagSlug,
  tagsFromInput,
  tidyTagInput,
} from "@/lib/tags";
import type { TagRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Tags, typed the way you would say them: "coding, design".
 *
 * One line instead of a wall of checkboxes. Names that are tags already are
 * recognised as you type — by name, ignoring case, or by the address they
 * would get — and anything else is marked new and becomes a real tag when
 * the entry is saved. There is no trip to Taxonomy first.
 *
 * The tags that exist sit underneath as suggestions, narrowed to whatever is
 * being typed, so picking one is still a single tap on a phone.
 *
 * The text belongs to this field; the document only ever holds what the text
 * means (`tagIds` and `newTags`). Keeping them apart is what lets a trailing
 * comma survive the render that follows it.
 */

/** Enough to choose from without turning the sheet into a tag cloud. */
const SUGGESTIONS = 12;

export function TagField({
  doc,
  patch,
  allTags,
}: {
  doc: EditorDoc;
  patch: EditorPatch;
  allTags: TagRow[];
}) {
  const inputId = useId();
  const hintId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => tagInputText(doc.tagIds, doc.newTags, allTags));

  // The document moved without this field — a restored draft, or a save that
  // turned a typed name into a tag. Show what it holds now. Typing never
  // lands here: the text it leaves behind already means the same tags.
  useEffect(() => {
    if (!sameTags(tagsFromInput(text, allTags), doc)) {
      setText(tagInputText(doc.tagIds, doc.newTags, allTags));
    }
    // Deliberately not on `text`: that is the field's own, and reacting to it
    // would put the canonical spelling back mid-word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.tagIds, doc.newTags, allTags]);

  const read = useMemo(() => readTagInput(text, allTags), [text, allTags]);
  const fresh = read.items.filter((item) => !item.id);

  /* What is being typed right now: the piece after the last comma. It narrows
     the suggestions, and while it is still a fragment — not a tag in its own
     right — a suggestion picked from it takes its place. */
  const typing = cleanTagName(text.split(/[,\n]/).pop() ?? "");
  const typingSlug = tagSlug(typing);
  const fragment = typing !== "" && !readTagInput(typing, allTags).items[0]?.id;
  const chosen = new Set(read.items.map((item) => item.id).filter(Boolean));
  const matching = allTags.filter(
    (tag) =>
      !chosen.has(tag.id) &&
      (!typing ||
        tag.name.toLowerCase().includes(typing.toLowerCase()) ||
        (typingSlug !== "" && tag.slug.includes(typingSlug)))
  );
  const suggestions = matching.slice(0, SUGGESTIONS);
  const full = read.items.length >= MAX_TAGS;

  const update = (next: string) => {
    setText(next);
    const tags = tagsFromInput(next, allTags);
    // Named, not just merged: removing the last new name has to clear the
    // key, and a patch without it would leave the old names in place.
    patch({ tagIds: tags.tagIds, newTags: tags.newTags });
  };

  const pick = (tag: TagRow) => {
    const pieces = text.split(/[,\n]/);
    if (fragment) pieces.pop();
    const kept = pieces.map((piece) => piece.trim()).filter(Boolean);
    update(`${[...kept, tag.name].join(", ")}, `);
    input.current?.focus();
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
        Tags
      </label>
      <input
        ref={input}
        id={inputId}
        type="text"
        value={text}
        onChange={(event) => update(event.target.value)}
        onBlur={() => {
          const tidy = tidyTagInput(text, allTags);
          if (tidy !== text) setText(tidy);
        }}
        placeholder="coding, design"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="done"
        aria-describedby={hintId}
        className={inputCls}
      />

      <p id={hintId} className="mt-1 text-xs text-faint">
        Separate with commas. A name that isn&apos;t a tag yet becomes one when you save.
      </p>

      {read.items.length > 0 && (
        <ul aria-label="Tags on this entry" className="mt-2.5 flex flex-wrap gap-1.5">
          {read.items.map((item) => (
            <li
              key={item.id ?? `new:${item.name}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-mono text-2xs uppercase tracking-wide",
                item.id ? "border-line-strong text-soft" : "border-transparent bg-hl-soft text-ink"
              )}
            >
              {item.name}
              {!item.id && <span className="rounded-sm bg-hl px-1 font-semibold text-hl-ink">new</span>}
            </li>
          ))}
        </ul>
      )}

      {fresh.length > 0 && (
        <p className="mt-1.5 text-xs text-soft">
          {fresh.length === 1
            ? `“${fresh[0].name}” will be added to your tags when you save.`
            : `${fresh.length} new tags will be added when you save.`}
        </p>
      )}
      {read.unusable.length > 0 && (
        <p className="mt-1.5 text-xs text-red" role="status">
          {read.unusable.map((name) => `“${name}”`).join(", ")}{" "}
          {read.unusable.length === 1 ? "needs" : "need"} at least one letter or number to be a tag.
        </p>
      )}
      {read.truncated && (
        <p className="mt-1.5 text-xs text-red" role="status">
          An entry can have {MAX_TAGS} tags — the rest are left off.
        </p>
      )}

      {!full && suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 font-mono text-2xs uppercase tracking-widest text-faint">
            {typing ? "Matching tags" : "Your tags"}
          </p>
          <div className="flex flex-wrap gap-x-1.5">
            {suggestions.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => pick(tag)}
                aria-label={`Add the tag ${tag.name}`}
                className="inline-flex min-h-11 items-center gap-1 rounded-[4px] px-1.5 text-sm text-soft transition-colors hover:text-pen"
              >
                <span aria-hidden className="text-faint">
                  +
                </span>
                {tag.name}
              </button>
            ))}
            {matching.length > suggestions.length && (
              <span className="inline-flex min-h-11 items-center px-1.5 text-xs text-faint">
                +{matching.length - suggestions.length} more — type to find them
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
