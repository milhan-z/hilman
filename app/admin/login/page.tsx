"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn, type ActionState } from "../actions";

const initialState: ActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded bg-pen px-5 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending ? "Unlocking…" : "Enter the studio"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(signIn, initialState);

  return (
    <div className="dotgrid flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-8 shadow-lift">
        <p className="font-hand text-xl text-faint">staff entrance</p>
        <h1 className="mt-1 font-display text-2xl font-bold">
          Hilman<span className="text-pen">.</span> studio
        </h1>
        <form action={action} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded border border-line bg-raise px-3.5 py-2.5 outline-none transition-colors focus:border-pen"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded border border-line bg-raise px-3.5 py-2.5 outline-none transition-colors focus:border-pen"
            />
          </label>
          {state.status === "error" && (
            <p role="alert" className="rounded border border-red/40 bg-red-soft px-3 py-2 text-sm text-red">
              {state.message}
            </p>
          )}
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}
