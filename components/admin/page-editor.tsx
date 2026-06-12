"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Field, TextArea, TextInput } from "./fields";
import { savePage, type ActionState } from "@/app/admin/actions";

const initialState: ActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-hl px-5 py-2.5 text-sm font-medium text-hl-ink hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save page"}
    </button>
  );
}

export function PageEditor({
  slug,
  title,
  data,
  hint,
}: {
  slug: string;
  title: string;
  data: Record<string, any>;
  hint?: string;
}) {
  const [state, action] = useFormState(savePage, initialState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="slug" value={slug} />
      <Field label="Title">
        <TextInput name="title" defaultValue={title} />
      </Field>
      <Field label="Structured content (JSON)" hint={hint}>
        <TextArea
          name="data"
          rows={22}
          className="font-mono text-sm"
          defaultValue={JSON.stringify(data, null, 2)}
        />
      </Field>
      <div className="flex items-center gap-3">
        <SaveButton />
        {state.status === "success" && <span className="text-sm text-pen">Saved ✓</span>}
        {state.status === "error" && (
          <span role="alert" className="text-sm text-red">{state.message}</span>
        )}
      </div>
    </form>
  );
}
