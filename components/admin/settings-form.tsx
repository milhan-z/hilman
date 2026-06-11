"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Field, TextArea } from "./fields";
import { saveSettings, type ActionState } from "@/app/admin/actions";
import type { Settings } from "@/lib/types";

const initialState: ActionState = { status: "idle" };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="rounded bg-pen px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action] = useFormState(saveSettings, initialState);

  return (
    <form action={action} className="max-w-2xl space-y-6">
      <Field label="Hero roles" hint="One per line — rotates after “Creative …” on the home page.">
        <TextArea name="hero_roles" rows={6} defaultValue={settings.hero_roles.join("\n")} />
      </Field>
      <Field label="Social links (JSON)" hint='[{ "label": "Instagram", "url": "https://…" }]'>
        <TextArea name="socials" rows={8} className="font-mono text-sm" defaultValue={JSON.stringify(settings.socials, null, 2)} />
      </Field>
      <Field label="Navigation (JSON)" hint='[{ "label": "Works", "href": "/works" }]'>
        <TextArea name="nav" rows={8} className="font-mono text-sm" defaultValue={JSON.stringify(settings.nav, null, 2)} />
      </Field>
      <div className="flex items-center gap-3">
        <SaveButton />
        {state.status === "success" && <span className="text-sm text-pen">Saved ✓</span>}
        {state.status === "error" && <span role="alert" className="text-sm text-red">{state.message}</span>}
      </div>
    </form>
  );
}
