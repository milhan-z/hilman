"use client";

import { useState, type ComponentType } from "react";

/**
 * The parts of the editor that are fetched rather than imported.
 *
 * Some of the editor is left out of its first download: the Custom HTML
 * editor, the import sheet and the canvas previews that render sanitised
 * markup. They bring sanitize-html, postcss and an HTML parser with them, and
 * a phone should not have to fetch and run those before it can show the page
 * being edited. Each is fetched the first time it is needed, and the editor
 * fetches the rest once it has settled (see warmEditor() in live-editor.tsx),
 * so they are there if the connection goes later.
 */

/**
 * The component itself once it has arrived, otherwise its next/dynamic wrapper.
 *
 * The wrapper on its own makes everything wait at least once, however long
 * ago the code arrived: React.lazy only learns that by awaiting a promise, and
 * React keeps a fallback it has shown up for a minimum time. That is the
 * difference between pressing Enter and the paragraph you just wrote staying
 * on screen, and it going blank for a third of a second.
 *
 * Decided once per mount. Something that started behind the wrapper stays
 * there, because swapping would remount it — and a remount resets a gallery's
 * scroll position or an embed that has been started.
 */
export function useLoadedOr<P>(
  loaded: ComponentType<P> | null,
  wrapper: ComponentType<P>
): ComponentType<P> {
  const [component] = useState<ComponentType<P>>(() => loaded ?? wrapper);
  return component;
}

/* ── the two states in between ── */

/** On its way. Short-lived, so it says so quietly. */
export function DeferredLoading({ what }: { what: string }) {
  return <p className="py-6 text-center text-sm text-faint">Loading {what}…</p>;
}

/**
 * Could not be fetched.
 *
 * next/dynamic reports a failed fetch by throwing, and nothing in the studio
 * catches a thrown render: the whole editor would go, with whatever is on the
 * screen. So each loader turns a failure into this instead. Once the fetch
 * has failed, the page itself has to be reloaded to try again — the recovery
 * copy on this device carries the writing across.
 */
export function DeferredUnavailable() {
  return (
    <p role="alert" className="rounded-md border border-line bg-raise px-3.5 py-3 text-sm text-soft">
      This part of the editor didn&apos;t load — it needs a connection the first time. Reload
      when you&apos;re back online.
    </p>
  );
}
