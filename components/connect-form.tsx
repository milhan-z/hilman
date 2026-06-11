"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendMessage, type ConnectState } from "@/app/(site)/connect/actions";

const initialState: ConnectState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded bg-pen px-6 py-2.5 text-sm font-medium text-white transition-opacity duration-base hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send it over"}
    </button>
  );
}

export function ConnectForm() {
  const [state, action] = useFormState(sendMessage, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-lg border border-line bg-surface p-8 text-center shadow-card">
        <p className="font-display text-xl font-semibold">Got it. Thanks!</p>
        <p className="mt-2 text-soft">Your note is on my desk — I’ll get back to you soon.</p>
        <p className="mt-3 font-hand text-lg text-faint">probably with too many follow-up questions</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-5">
      {/* honeypot — humans never see or fill this */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label>
          Leave this field empty
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            className="w-full rounded border border-line bg-raise px-4 py-2.5 text-base outline-none transition-colors focus:border-pen"
          />
        </div>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className="w-full rounded border border-line bg-raise px-4 py-2.5 text-base outline-none transition-colors focus:border-pen"
          />
        </div>
      </div>
      <div>
        <label htmlFor="body" className="mb-1.5 block text-sm font-medium">
          What’s on your mind?
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={5000}
          className="ruled w-full rounded border border-line bg-raise px-4 py-2.5 text-base leading-8 outline-none transition-colors focus:border-pen"
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded border border-red/40 bg-red-soft px-4 py-3 text-sm text-red">
          {state.message ?? "Something went sideways. Mind trying again?"}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
