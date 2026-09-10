"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveJournal } from "@/app/admin/actions";
import { Field, TextInput, TextArea } from "./fields";
import { DraftRecoveryNotice, SaveStatus } from "./save-status";
import { useEditorDraft } from "./use-editor-draft";

const EXCERPT_LIMIT = 200;

/**
 * Catch a thought in under a minute.
 *
 * The note text becomes a real paragraph block, not just an excerpt: an idea
 * saved only into the card summary is an idea you have to retype when you
 * open the editor properly.
 */
export function QuickDraft() {
  const router = useRouter();
  const draft = useEditorDraft("quick-draft", { title: "", note: "" });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<{ id: string; title: string } | null>(null);

  function onSave() {
    const { title, note } = draft.value;
    if (!title.trim()) {
      draft.markError("a title is needed");
      return;
    }
    draft.markSaving();

    const paragraphs = note
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);

    const blocks = paragraphs.map((text, i) => ({
      id: `qd-${i}`,
      type: "paragraph",
      position: i,
      data: { text },
    }));

    const excerpt =
      paragraphs[0] && paragraphs[0].length > EXCERPT_LIMIT
        ? `${paragraphs[0].slice(0, EXCERPT_LIMIT).trimEnd()}…`
        : (paragraphs[0] ?? "");

    const fd = new FormData();
    fd.set("id", "");
    fd.set("title", title.trim());
    fd.set("status", "draft");
    fd.set("excerpt", excerpt);
    fd.set("blocks", JSON.stringify(blocks));
    fd.set("tag_ids", "[]");
    fd.set("stay", "1");

    startTransition(async () => {
      const res = await saveJournal({ status: "idle" }, fd);
      if (res.status === "error") {
        draft.markError(res.message ?? "save failed");
        return;
      }
      draft.markSaved({ title: "", note: "" }, res.savedAt);
      draft.setValue({ title: "", note: "" });
      setSaved({ id: res.id ?? "", title: title.trim() });
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <h3 className="flex items-center gap-2 font-display text-base font-bold text-ink">
        <span>Quick Draft</span>
        <span className="font-hand text-sm font-normal normal-case text-soft">
          what&apos;s on your mind?
        </span>
      </h3>

      <div className="mt-4 space-y-4">
        <DraftRecoveryNotice
          recovery={draft.recovery}
          onAccept={draft.acceptRecovery}
          onDiscard={draft.discardRecovery}
        />

        <Field label="Title">
          <TextInput
            value={draft.value.title}
            onChange={(e) => draft.setValue((p) => ({ ...p, title: e.target.value }))}
            placeholder="What are you thinking about?"
            className="text-sm"
          />
        </Field>

        <Field label="The note" hint="Blank line starts a new paragraph. Saved as real content.">
          <TextArea
            value={draft.value.note}
            onChange={(e) => draft.setValue((p) => ({ ...p, note: e.target.value }))}
            placeholder="Start typing — you can finish it later."
            rows={4}
            className="text-sm"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex min-h-[38px] items-center rounded bg-hl px-4 text-xs font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <SaveStatus state={draft.save} />
        </div>

        {saved && (
          <p className="text-xs text-soft">
            Saved “{saved.title}” as a draft —{" "}
            {saved.id ? (
              <a href={`/admin/journal/${saved.id}`} className="text-pen hover:underline">
                keep writing
              </a>
            ) : (
              <span>find it under Journal</span>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}
