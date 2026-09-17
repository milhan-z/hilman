"use client";

import { useSyncState } from "./studio-runtime";
import { cn } from "@/lib/utils";
import type { UploadNoun } from "@/lib/studio-editor-state";

/**
 * One word about whether your work has actually left this phone.
 *
 * The studio already refuses to say "Saved" about a version that is no longer
 * on screen. This extends the same honesty across the network: "Saved" now
 * means saved *here*, and only "Synced" means the site has it. The states are
 * deliberately distinguishable without colour — a dot plus a word — because
 * "is my writing safe?" is not a question to answer with a hue.
 */

export type StudioConnectivity = "synced" | "queued" | "syncing" | "offline" | "attention";

/**
 * "2 photos", "1 clip", "3 files".
 *
 * The word is whatever is actually in the queue, not always "photo" — loop
 * clips upload through the same path, and this pill used to call them
 * photographs. See uploadNoun() in lib/studio-local/sync.ts.
 */
const uploads = (count: number, noun: UploadNoun) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;
const changes = (count: number) => `${count} ${count === 1 ? "change" : "changes"}`;

/** What is waiting, in one word and one sentence. */
export function connectivityFrom(state: {
  reachable: boolean;
  syncing: boolean;
  queued: number;
  blocked: number;
  conflicts: number;
  media: number;
  uploads?: { noun: UploadNoun };
}): { kind: StudioConnectivity; label: string; detail: string } {
  const noun = state.uploads?.noun ?? "photo";
  if (state.conflicts > 0 || state.blocked > 0) {
    const count = state.conflicts + state.blocked;
    return {
      kind: "attention",
      label: state.conflicts > 0 ? "Conflict" : "Needs a fix",
      detail: `${count} ${count === 1 ? "change needs" : "changes need"} your decision.`,
    };
  }
  if (state.syncing) {
    return {
      kind: "syncing",
      label: "Syncing",
      detail:
        state.media > 0
          ? `Uploading ${noun}s, then your changes.`
          : "Sending your changes to the site.",
    };
  }

  const waiting = [
    state.queued > 0 ? changes(state.queued) : null,
    state.media > 0 ? uploads(state.media, noun) : null,
  ].filter(Boolean) as string[];

  if (!state.reachable) {
    return {
      kind: "offline",
      label: "Offline",
      detail:
        waiting.length > 0
          ? `${waiting.join(" and ")} waiting for a connection.`
          : "Everything you write is kept on this phone until you're back.",
    };
  }
  if (waiting.length > 0) {
    return { kind: "queued", label: "Queued", detail: `${waiting.join(" and ")} waiting to send.` };
  }
  return { kind: "synced", label: "Synced", detail: "The site has everything you've saved." };
}

const DOT: Record<StudioConnectivity, string> = {
  synced: "bg-pen",
  queued: "bg-hl",
  syncing: "bg-hl animate-pulse",
  offline: "bg-faint",
  attention: "bg-red",
};

export function ConnectivityPill({ onOpen }: { onOpen: () => void }) {
  const state = useSyncState();
  const { kind, label, detail } = connectivityFrom(state);
  const waiting = state.queued + state.blocked + state.conflicts + state.media;

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. ${detail} Open sync details.`}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-3 font-mono text-2xs uppercase tracking-wide transition-colors",
        kind === "attention"
          ? "border-red bg-red-soft text-red"
          : "border-line bg-raise text-soft hover:text-ink"
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", DOT[kind])} />
      {label}
      {waiting > 0 && (
        <span
          aria-hidden
          className="rounded-full bg-line-strong px-1.5 text-2xs font-semibold text-ink"
        >
          {waiting}
        </span>
      )}
    </button>
  );
}
