"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { sendMessage, type ConnectState } from "@/app/(site)/connect/actions";

const labelCls = "mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint";
const inputCls =
  "w-full rounded-md border border-line-strong bg-raise px-4 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-pen focus:ring-1 focus:ring-pen";

export function ConnectForm() {
  const [note, setNote] = useState(0);
  return <NoteForm key={note} focusName={note > 0} onNewNote={() => setNote((value) => value + 1)} />;
}

function NoteForm({ focusName, onNewNote }: { focusName: boolean; onNewNote: () => void }) {
  const [state, action, pending] = useActionState(sendMessage, initialState);
  const sent = state.status === "success";
  const locked = pending || sent;
  const nameInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  // React 19 resets uncontrolled action forms after resolution, including an
  // error result. Keep the visitor's note intact so a failed send is retryable.
  const [fields, setFields] = useState({ name: "", email: "", body: "" });

  useEffect(() => {
    // Only an explicit "Write another note" starts a fresh form and moves focus.
    if (focusName) nameInput.current?.focus();
  }, [focusName]);

  useEffect(() => {
    if (!pending) submitting.current = false;
  }, [pending, state]);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Block repeated submits even before React renders the pending state.
        if (locked || submitting.current) event.preventDefault();
        else submitting.current = true;
      }}
      className="space-y-5"
    >
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
          <input ref={nameInput} id="name" name="name" value={fields.name} onChange={(event) => setFields((value) => ({ ...value, name: event.target.value }))} readOnly={locked} required maxLength={120} autoComplete="name" className={inputCls} />
        </div>
        <div>
          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            name="email"
            value={fields.email}
            onChange={(event) => setFields((value) => ({ ...value, email: event.target.value }))}
            type="email"
            readOnly={locked}
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
          value={fields.body}
          onChange={(event) => setFields((value) => ({ ...value, body: event.target.value }))}
          required
          readOnly={locked}
          rows={6}
          maxLength={5000}
          className={`${inputCls} ruled leading-8`}
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <button
            type={sent ? "button" : "submit"}
            // aria-disabled keeps keyboard focus on the same button as its
            // label changes. The form also guards Enter/repeated submissions.
            aria-disabled={locked}
            aria-describedby="connect-feedback"
            onClick={(event) => { if (locked) event.preventDefault(); }}
            data-state={pending ? "sending" : sent ? "sent" : "idle"}
            className="connect-send inline-flex min-h-[48px] min-w-[190px] items-center justify-center gap-3 rounded-md border border-line-strong bg-transparent px-5 py-2.5 text-sm font-medium text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen"
          >
            <span>{pending ? "Sending…" : sent ? "Sent. Thank you!" : "Send it over"}</span>
            <svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pen">
              {sent ? (
                <path className="connect-send-check" pathLength="1" d="m5 12 4 4L19 6" />
              ) : (
                <g className="connect-send-plane">
                  <path d="m21 3-7 18-4-7-7-4 18-7Z" />
                  <path d="m10 14 5-5" />
                </g>
              )}
            </svg>
          </button>
          {sent && (
            <button type="button" onClick={onNewNote} className="min-h-[44px] text-sm text-soft underline decoration-line-strong underline-offset-4 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pen">
              Write another note
            </button>
          )}
        </div>
        <p id="connect-feedback" role="status" aria-atomic="true" className="mt-3 text-sm leading-relaxed text-soft">
          {pending ? "Sending your note…" : sent ? "Your note is on my desk. I’ll get back to you soon." : state.status === "error" ? "Your note is still here. You can try again." : "I’ll reply to the email above."}
        </p>
        {state.status === "error" && !pending && (
          <p role="alert" className="mt-2 text-sm text-red">
            {state.message ?? "Something went sideways. Mind trying again?"}
          </p>
        )}
      </div>
    </form>
  );
}

const initialState: ConnectState = { status: "idle" };
