"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initCorePages } from "@/app/admin/actions";

/**
 * Creates the Home / About / Connect rows if they are missing and touches
 * nothing else. The Pages screen used to point at `npm run seed` here, which
 * deletes every project, entry, page and setting before inserting demo data.
 */
export function InitPagesButton({ missing }: { missing: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-line-strong bg-surface p-5">
      <p className="text-sm font-medium text-ink">
        Missing {missing.length === 1 ? "page" : "pages"}: {missing.join(", ")}
      </p>
      <p className="mt-1 text-sm text-soft">
        Adds the empty rows so you can fill them in. Existing content is not touched.
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await initCorePages();
            if (res.status === "error") setError(res.message ?? "Could not create the pages.");
            else router.refresh();
          });
        }}
        className="mt-3 rounded bg-hl px-4 py-2 text-sm font-semibold text-hl-ink disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create missing pages"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red">
          {error}
        </p>
      )}
    </div>
  );
}
