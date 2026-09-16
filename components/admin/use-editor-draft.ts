"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteDraft, readDraft, writeDraft } from "@/lib/studio-local/drafts";

/**
 * Shared editor plumbing: honest save status, a warning before losing work,
 * and local draft recovery.
 *
 * The rules this encodes:
 *  - "Saved ✓" belongs to the version that was saved. Type one more character
 *    and the badge goes back to "unsaved changes" instead of lying.
 *  - A recovered draft is never published on its own. It is offered, and the
 *    editor still has to press Save.
 *  - "Saved" and "Synced" are different claims. A save that is waiting for a
 *    network says "Queued" until it has actually left the phone.
 *
 * The drafts themselves moved from localStorage to IndexedDB. localStorage
 * writes are synchronous, so persisting a long body ran on the same tick as the
 * keystroke that caused it; on a phone that is a visible stutter while typing.
 * The writes here are asynchronous and coalesced.
 */

export type SaveState =
  | { kind: "clean"; savedAt?: string }
  | { kind: "dirty" }
  | { kind: "saving" }
  /** Kept locally and waiting for a connection. Not on the site yet. */
  | { kind: "queued" }
  | { kind: "error"; message: string };

/** How long typing has to pause before the draft is written down. */
const PERSIST_DEBOUNCE_MS = 400;

export interface DraftRecovery<T> {
  value: T;
  savedAt: string;
}

export function useEditorDraft<T>(key: string, initial: T) {
  const [value, setValueState] = useState<T>(initial);
  const [save, setSave] = useState<SaveState>({ kind: "clean" });
  const [recovery, setRecovery] = useState<DraftRecovery<T> | null>(null);

  // The value as last confirmed saved — used to decide whether we are dirty.
  const savedSnapshot = useRef(JSON.stringify(initial));
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<T | null>(null);
  const dirty = save.kind === "dirty" || save.kind === "error";

  /* ── offer a recovered draft, never apply it silently ── */
  useEffect(() => {
    let cancelled = false;
    void readDraft<DraftRecovery<T>>(key).then((stored) => {
      if (cancelled || !stored) return;
      const recovered = stored.value;
      if (!recovered || typeof recovered !== "object") return;
      if (JSON.stringify(recovered.value) === savedSnapshot.current) {
        void deleteDraft(key);
        return;
      }
      setRecovery(recovered);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const flush = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const next = pending.current;
    if (next === null) return;
    pending.current = null;

    // A draft the recovery list cannot name is a draft you have to open to
    // identify, so the title comes along when the form has one.
    const title = String((next as { title?: unknown })?.title ?? "").trim();

    void writeDraft({
      key,
      entity: key.includes(":") ? key.split(":")[0] : "widget",
      entityId: null,
      localId: key,
      value: { value: next, savedAt: new Date().toISOString() },
      baseUpdatedAt: null,
      editedAt: new Date().toISOString(),
      ...(title ? { label: title } : {}),
    });
  }, [key]);

  /* ── keep the local copy current while there are unsaved edits ── */
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValueState((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;

        if (JSON.stringify(resolved) === savedSnapshot.current) {
          setSave((s) => (s.kind === "saving" ? s : { kind: "clean" }));
          pending.current = null;
          if (persistTimer.current) clearTimeout(persistTimer.current);
          persistTimer.current = null;
          void deleteDraft(key);
          return resolved;
        }

        setSave({ kind: "dirty" });
        pending.current = resolved;
        if (persistTimer.current) clearTimeout(persistTimer.current);
        persistTimer.current = setTimeout(flush, PERSIST_DEBOUNCE_MS);
        return resolved;
      });
    },
    [key, flush]
  );

  /* ── don't let a reload or a stray link eat unsaved work ── */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Write the debounced draft out before the page goes: the warning is a
      // courtesy, the draft on disk is the actual safety net.
      flush();
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, flush]);

  // Leaving the editor by navigating inside the app never fires beforeunload.
  useEffect(() => flush, [flush]);

  const markSaving = useCallback(() => setSave({ kind: "saving" }), []);
  const markQueued = useCallback(() => setSave({ kind: "queued" }), []);

  const markSaved = useCallback(
    (savedValue: T, savedAt?: string) => {
      const serialised = JSON.stringify(savedValue);
      savedSnapshot.current = serialised;
      pending.current = null;
      if (persistTimer.current) clearTimeout(persistTimer.current);
      persistTimer.current = null;
      void deleteDraft(key);
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
    [key]
  );

  const markError = useCallback((message: string) => setSave({ kind: "error", message }), []);

  const acceptRecovery = useCallback(() => {
    if (!recovery) return;
    setValue(recovery.value);
    setRecovery(null);
  }, [recovery, setValue]);

  const discardRecovery = useCallback(() => {
    void deleteDraft(key);
    setRecovery(null);
  }, [key]);

  return {
    value,
    setValue,
    save,
    dirty,
    markSaving,
    markQueued,
    markSaved,
    markError,
    recovery,
    acceptRecovery,
    discardRecovery,
  };
}
