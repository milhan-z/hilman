"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Shared editor plumbing: honest save status, a warning before losing work,
 * and local draft recovery.
 *
 * The rules this encodes:
 *  - "Saved ✓" belongs to the version that was saved. Type one more character
 *    and the badge goes back to "unsaved changes" instead of lying.
 *  - A recovered draft is never published on its own. It is offered, and the
 *    editor still has to press Save.
 */

export type SaveState =
  | { kind: "clean"; savedAt?: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "error"; message: string };

const PREFIX = "hilman-draft:";

export interface DraftRecovery<T> {
  value: T;
  savedAt: string;
}

export function useEditorDraft<T>(key: string, initial: T) {
  const storageKey = `${PREFIX}${key}`;

  const [value, setValueState] = useState<T>(initial);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  const [recovery, setRecovery] = useState<DraftRecovery<T> | null>(null);

  // The value as last confirmed saved — used to decide whether we are dirty.
  const savedSnapshot = useRef(JSON.stringify(initial));
  const dirty = save.kind === "dirty" || save.kind === "error";

  /* ── offer a recovered draft, never apply it silently ── */
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftRecovery<T>;
      if (JSON.stringify(parsed.value) === savedSnapshot.current) {
        window.localStorage.removeItem(storageKey);
        return;
      }
      setRecovery(parsed);
    } catch {
      /* a corrupt draft is not worth interrupting the editor over */
    }
  }, [storageKey]);

  /* ── keep the local copy current while there are unsaved edits ── */
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        const serialised = JSON.stringify(resolved);
        if (serialised === savedSnapshot.current) {
          setSave((s) => (s.kind === "saving" ? s : { kind: "clean" }));
          try {
            window.localStorage.removeItem(storageKey);
          } catch {}
        } else {
          setSave({ kind: "dirty" });
          try {
            window.localStorage.setItem(
              storageKey,
              JSON.stringify({ value: resolved, savedAt: new Date().toISOString() })
            );
          } catch {}
        }
        return resolved;
      });
    },
    [storageKey]
  );

  /* ── don't let a reload or a stray link eat unsaved work ── */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const markSaving = useCallback(() => setSave({ kind: "saving" }), []);

  const markSaved = useCallback(
    (savedValue: T, savedAt?: string) => {
      const serialised = JSON.stringify(savedValue);
      savedSnapshot.current = serialised;
      try {
        window.localStorage.removeItem(storageKey);
      } catch {}
      setRecovery(null);
      // If the editor typed while the save was in flight, stay dirty: the
      // badge must describe what is on screen, not what left the browser.
      setValueState((current) => {
        setSave(
          JSON.stringify(current) === serialised
            ? { kind: "clean", savedAt: savedAt ?? new Date().toISOString() }
            : { kind: "dirty" }
        );
        return current;
      });
    },
    [storageKey]
  );

  const markError = useCallback((message: string) => setSave({ kind: "error", message }), []);

  const acceptRecovery = useCallback(() => {
    if (!recovery) return;
    setValue(recovery.value);
    setRecovery(null);
  }, [recovery, setValue]);

  const discardRecovery = useCallback(() => {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {}
    setRecovery(null);
  }, [storageKey]);

  return {
    value,
    setValue,
    save,
    dirty,
    markSaving,
    markSaved,
    markError,
    recovery,
    acceptRecovery,
    discardRecovery,
  };
}
