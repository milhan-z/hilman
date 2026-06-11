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
        className="text-sm text-red underline-offset-4 hover:underline"
      >
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-3 text-sm">
      <span className="text-red">Sure? This can’t be undone.</span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => onConfirm())}
        className="rounded bg-red px-3 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button type="button" onClick={() => setArming(false)} className="text-soft hover:text-ink">
        Cancel
      </button>
    </span>
  );
}
