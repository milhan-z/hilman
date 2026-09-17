"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { signIn, signInWithPin, type ActionState } from "../actions";

const initialState: ActionState = { status: "idle" };
const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

const fieldCls =
  "w-full rounded-md border border-line-strong bg-raise px-3.5 py-2.5 outline-none transition-colors focus:border-pen focus:ring-1 focus:ring-pen";

function SubmitButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-md bg-hl px-5 py-3 text-sm font-medium text-hl-ink shadow-card transition-all hover:brightness-95 active:translate-y-px disabled:opacity-50"
    >
      {pending ? busy : label}
    </button>
  );
}

function PinForm({ onUseEmail }: { onUseEmail: () => void }) {
  const [state, action] = useActionState(signInWithPin, initialState);
  const [pin, setPin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const press = (key: string) =>
    setPin((current) =>
      key === "⌫" ? current.slice(0, -1) : (current + key).slice(0, PIN_LENGTH)
    );

  return (
    <form ref={formRef} action={action} className="mt-7">
      {/* The real value; the dots below are only a picture of it. */}
      <label htmlFor="pin" className="mb-2 block font-mono text-2xs uppercase tracking-widest text-faint">
        Your PIN
      </label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern={`\\d{${PIN_LENGTH}}`}
        maxLength={PIN_LENGTH}
        required
        autoFocus
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
        aria-describedby={state.status === "error" ? "pin-error" : undefined}
        className={`${fieldCls} text-center font-mono text-2xl tracking-[0.6em]`}
      />

      <div aria-hidden className="mt-4 flex justify-center gap-2.5">
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <span
            key={index}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${index < pin.length ? "bg-hl" : "bg-line-strong"}`}
          />
        ))}
      </div>

      {/* A keypad for thumbs. Everything here is also reachable by typing. */}
      <div className="mt-5 grid grid-cols-3 gap-2">
        {KEYS.map((key, index) =>
          key === "" ? (
            <span key={index} />
          ) : (
            <button
              key={index}
              type="button"
              onClick={() => press(key)}
              tabIndex={-1}
              aria-label={key === "⌫" ? "Delete last digit" : `Digit ${key}`}
              className="min-h-12 rounded-md border border-line bg-raise font-mono text-lg text-ink transition-colors hover:border-pen hover:text-pen active:translate-y-px"
            >
              {key}
            </button>
          )
        )}
      </div>

      {state.status === "error" && (
        <p id="pin-error" role="alert" className="mt-5 rounded border border-red bg-red-soft px-3 py-2 text-sm text-red">
          {state.message}
        </p>
      )}

      <div className="mt-5">
        <SubmitButton label="Enter the studio →" busy="Unlocking…" />
      </div>
      <button
        type="button"
        onClick={onUseEmail}
        className="mt-4 w-full text-center font-mono text-2xs uppercase tracking-widest text-faint transition-colors hover:text-pen"
      >
        Sign in with email instead
      </button>
    </form>
  );
}

function EmailForm({ onUsePin }: { onUsePin: () => void }) {
  const [state, action] = useActionState(signIn, initialState);

  return (
    <form action={action} className="mt-7 space-y-4">
      <label className="block">
        <span className="mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint">Email</span>
        <input name="email" type="email" required autoComplete="email" className={fieldCls} />
      </label>
      <label className="block">
        <span className="mb-1.5 block font-mono text-2xs uppercase tracking-widest text-faint">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className={fieldCls} />
      </label>
      {state.status === "error" && (
        <p role="alert" className="rounded border border-red bg-red-soft px-3 py-2 text-sm text-red">
          {state.message}
        </p>
      )}
      <SubmitButton label="Enter the studio →" busy="Unlocking…" />
      <button
        type="button"
        onClick={onUsePin}
        className="w-full text-center font-mono text-2xs uppercase tracking-widest text-faint transition-colors hover:text-pen"
      >
        Use the PIN instead
      </button>
    </form>
  );
}

export default function LoginPage() {
  const [mode, setMode] = useState<"pin" | "email">("pin");

  return (
    <div className="dotgrid flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm rounded-md border border-line-strong bg-surface p-8 shadow-lift">
        <p className="font-hand text-xl text-faint">staff entrance</p>
        <h1 className="mt-1 flex items-baseline gap-1 font-display text-2xl font-bold">
          <span className="flex items-baseline gap-0.5">
            Hilman
            <span aria-hidden className="inline-block h-2 w-2 rounded-[1px] bg-red" />
          </span>
          <span className="font-hand text-xl font-normal text-faint">studio</span>
        </h1>
        {mode === "pin" ? (
          <PinForm onUseEmail={() => setMode("email")} />
        ) : (
          <EmailForm onUsePin={() => setMode("pin")} />
        )}
      </div>
    </div>
  );
}
