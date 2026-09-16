"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, TextInput, TextArea } from "./fields";
import { DraftRecoveryNotice, SaveStatus } from "./save-status";
import { useEditorDraft } from "./use-editor-draft";
import { saveThroughQueue } from "@/lib/studio-local/save";
import { uid } from "@/lib/utils";

const EXCERPT_LIMIT = 200;

/**
 * Catch a thought in under a minute.
 *
 * The note text becomes a real paragraph block, not just an excerpt: an idea
 * saved only into the card summary is an idea you have to retype when you
 * open the editor properly.
 *
 * It saves through the outbox rather than calling the server directly, which
 * is the whole point on a phone — the thought is caught whether or not there
 * is a signal in the room you had it in.
 */
export function QuickDraft() {
  const router = useRouter();
  const draft = useEditorDraft("quick-draft", { title: "", note: "" });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState<{ id: string | null; title: string } | null>(null);

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
      type: "paragraph" as const,
      position: i,
      data: { text },
    }));

    const excerpt =
      paragraphs[0] && paragraphs[0].length > EXCERPT_LIMIT
        ? `${paragraphs[0].slice(0, EXCERPT_LIMIT).trimEnd()}…`
        : (paragraphs[0] ?? "");

    startTransition(async () => {
      const result = await saveThroughQueue({
        entity: "journal",
        entityId: null,
        localId: `journal:quick-${uid()}`,
        baseUpdatedAt: null,
        payload: {
          fields: { title: title.trim(), status: "draft", excerpt },
          blocks,
          tagIds: [],
        },
      });

      if (result.status === "rejected") {
        draft.markError(result.message);
        return;
      }
      if (result.status === "conflict") {
        // A create cannot conflict, but the type says it could — say something
        // true rather than pretending it saved.
        draft.markError("that entry already exists on the site");
        return;
      }

      const savedTitle = title.trim();
      if (result.status === "queued") {
        draft.markQueued();
        draft.setValue({ title: "", note: "" });
        setSaved({ id: null, title: savedTitle });
        return;
      }

      draft.markSaved({ title: "", note: "" });
      draft.setValue({ title: "", note: "" });
      setSaved({ id: result.id, title: savedTitle });
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
          />
        </Field>

        <Field label="The note" hint="Blank line starts a new paragraph. Saved as real content.">
          <TextArea
            value={draft.value.note}
            onChange={(e) => draft.setValue((p) => ({ ...p, note: e.target.value }))}
            placeholder="Start typing — you can finish it later."
            rows={4}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="inline-flex min-h-12 items-center rounded-md bg-hl px-5 text-sm font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <SaveStatus state={draft.save} />
        </div>

        {saved && (
          <p className="text-xs text-soft">
            {saved.id ? (
              <>
                Saved “{saved.title}” as a draft —{" "}
                <a href={`/admin/journal/${saved.id}`} className="text-pen hover:underline">
                  keep writing
                </a>
                .
              </>
            ) : (
              <>“{saved.title}” is kept on this phone and will appear under Journal once it sends.</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
