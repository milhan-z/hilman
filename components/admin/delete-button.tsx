"use client";

import { useState, useTransition } from "react";

/** Two-step destructive action — red pen rules: ask once, then act. */
export function DeleteButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => Promise<void>;
}) {
  const [arming, setArming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!arming) {
    return (
      <button
        type="button"
        onClick={() => setArming(true)}
        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 text-sm text-red underline-offset-4 hover:underline"
      >
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-3 text-sm">
      <span className="text-red">Sure? This can’t be undone.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => onConfirm())}
        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 rounded bg-red px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" onClick={() => setArming(false)} className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 text-soft hover:text-ink">
        Cancel
      </button>
    </span>
  );
}
