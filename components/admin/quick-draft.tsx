"use client";

import { useFormState, useFormStatus } from "react-dom";
import { saveJournal } from "@/app/admin/actions";
import { Field, TextInput, TextArea } from "./fields";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[38px] items-center rounded bg-hl px-4 text-xs font-semibold text-hl-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving..." : "Save Draft"}
    </button>
  );
}

export function QuickDraft() {
  const [state, action] = useFormState(saveJournal, { status: "idle" });

  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <h3 className="font-display text-base font-bold text-ink flex items-center gap-2">
        <span>Quick Draft</span>
        <span className="font-hand text-sm text-faint normal-case font-normal">what's on your mind?</span>
      </h3>
      <form action={action} className="mt-4 space-y-4">
        {/* Hidden fields to create a draft post */}
        <input type="hidden" name="id" value="" />
        <input type="hidden" name="status" value="draft" />
        <input type="hidden" name="blocks" value="[]" />
        <input type="hidden" name="tag_ids" value="[]" />

        <Field label="Title">
          <TextInput
            name="title"
            placeholder="Title of your new post..."
            required
            className="text-sm"
          />
        </Field>

        <Field label="Content Outline / Excerpt">
          <TextArea
            name="excerpt"
            placeholder="Write a brief summary or start typing outline..."
            rows={3}
            className="text-sm"
          />
        </Field>

        <div className="flex items-center justify-between pt-1">
          <SubmitButton />
          {state?.status === "error" && (
            <span role="alert" className="text-xs text-red font-medium">
              {state.message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
