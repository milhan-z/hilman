"use client";

import { useSyncState } from "./studio-runtime";
import { cn } from "@/lib/utils";

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

const photos = (count: number) => `${count} ${count === 1 ? "photo" : "photos"}`;
const changes = (count: number) => `${count} ${count === 1 ? "change" : "changes"}`;

/** What is waiting, in one word and one sentence. */
export function connectivityFrom(state: {
  reachable: boolean;
  syncing: boolean;
  queued: number;
  blocked: number;
  conflicts: number;
  media: number;
}): { kind: StudioConnectivity; label: string; detail: string } {
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
      detail: state.media > 0 ? "Uploading photos, then your changes." : "Sending your changes to the site.",
    };
  }

  const waiting = [
    state.queued > 0 ? changes(state.queued) : null,
    state.media > 0 ? photos(state.media) : null,
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
