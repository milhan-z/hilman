"use client";

import { useFormState, useFormStatus } from "react-dom";
import { sendMessage, type ConnectState } from "@/app/(site)/connect/actions";

const labelCls = "mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint";
const inputCls =
  "w-full rounded-md border border-line-strong bg-raise px-4 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-faint/70 focus:border-pen focus:ring-1 focus:ring-pen";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-hl px-6 py-2.5 text-sm font-medium text-hl-ink shadow-card transition-all duration-base hover:brightness-95 hover:shadow-glow active:translate-y-px disabled:opacity-50"
    >
      {pending ? "Sending…" : "Send it over →"}
    </button>
  );
}

export function ConnectForm() {
  const [state, action] = useFormState(sendMessage, initialState);

  if (state.status === "success") {
    return (
      <div className="rounded-md border border-line bg-surface p-8 text-center shadow-card">
        <p className="font-display text-2xl font-semibold">Got it. Thanks!</p>
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
          <label htmlFor="name" className={labelCls}>
            Name
          </label>
          <input id="name" name="name" required maxLength={120} autoComplete="name" className={inputCls} />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            className={inputCls}
          />
        </div>
      </div>
      <div>
        <label htmlFor="body" className={labelCls}>
          What’s on your mind?
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={5000}
          className={`${inputCls} ruled leading-8`}
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="rounded-md border border-red/40 bg-red-soft px-4 py-3 text-sm text-red">
          {state.message ?? "Something went sideways. Mind trying again?"}
        </p>
      )}

      <SubmitButton />
    </form>
  );
}

const initialState: ConnectState = { status: "idle" };
