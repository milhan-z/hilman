"use client";

import { listConflicts } from "./conflicts";
import { deleteDraft, listDrafts, readDraft, writeDraft, type LocalDraft } from "./drafts";
import { listPendingMedia } from "./media";
import { listQueue } from "./outbox";

/**
 * When a recovery copy may be looked at, and when it may be thrown away.
 *
 * ── the data loss this module exists to end ──
 *
 * LiveEditor opened with `kept` and `synced` both set to the server document,
 * so on the first commit `snapshot === synced` was true and the effect that
 * tidies away a *stale* recovery copy fired straight away — before the effect
 * that looks for one had read it. Both went to IndexedDB, the delete
 * transaction was created first, and IndexedDB runs transactions over a store
 * in creation order. The delete won every time.
 *
 * So: write a paragraph on a train, have the app killed, reopen the entry, and
 * the paragraph is gone — destroyed by opening the page that existed to offer
 * it back.
 *
 * The fix is not a longer delay or a flag in a component. It is to say out
 * loud that the recovery copy has one lifecycle with one order to it:
 *
 *     look  →  decide  →  (offer | clean up)
 *
 * and to make the cleanup step physically unable to run before the look. That
 * is what `seen` below is: not a cache, a gate. Cleanup asks "has anybody
 * actually examined this key yet?" and the answer is no until `findRecovery`
 * has returned.
 *
 * The gate lives at module scope rather than in a component because it is a
 * fact about this device's storage, not about one mounted editor — two
 * editors, a remount, or a route change must not each get their own idea of
 * whether the key has been read.
 */

/** What was found under a draft key, and what the editor should do about it. */
export type RecoveryDecision =
  /** Nothing on this device. */
  | { kind: "none" }
  /** A copy of exactly what the site already has. Safe to tidy away. */
  | { kind: "stale" }
  /** Writing that exists nowhere else. Offer it; never apply it. */
  | {
      kind: "offer";
      snapshot: string;
      savedAt: string;
      /**
       * The row's `updated_at` as it was when this writing was made.
       *
       * Not the version the page was just served with. The two are different
       * whenever something changed in between, and that difference is the
       * entire signal conflict detection runs on — see restoreBase().
       */
      baseUpdatedAt: string | null;
    };

interface DraftValue {
  snapshot: string;
  savedAt: string;
}

/** Keys a lookup has completed for. Cleanup is refused for anything else. */
const seen = new Map<string, RecoveryDecision>();

/**
 * Reads whatever is stored for this key and decides what it means.
 *
 * Call this before anything else touches the key. It is the only function
 * that opens the gate.
 */
export async function findRecovery(
  key: string,
  currentSnapshot: string
): Promise<RecoveryDecision> {
  const stored = await readDraft<DraftValue>(key);

  const decision: RecoveryDecision = !stored?.value?.snapshot
    ? { kind: "none" }
    : stored.value.snapshot === currentSnapshot
      ? { kind: "stale" }
      : {
          kind: "offer",
          snapshot: stored.value.snapshot,
          savedAt: stored.value.savedAt,
          baseUpdatedAt: stored.baseUpdatedAt ?? null,
        };

  seen.set(key, decision);
  return decision;
}

/**
 * Tidies away a recovery copy the site demonstrably already has.
 *
 * Returns whether it actually removed anything, so a caller cannot mistake
 * "refused, we have not looked yet" for "there was nothing there".
 *
 * Refuses in three cases, each of which used to be a way to lose writing:
 * before any lookup has run for this key; when the lookup found something
 * worth offering; and when what is stored is no longer identical to what the
 * site has, which means somebody typed since.
 */
export async function keepRecovery(
  key: string,
  syncedSnapshot: string,
  sender?: string
): Promise<boolean> {
  const decision = seen.get(key);
  if (!decision) return false;
  if (decision.kind === "offer") return false;

  // Re-read rather than trusting the decision: between the lookup and now a
  // debounce may have written a newer copy down.
  const stored = await readDraft<DraftValue>(key);
  if (!stored) return false;

  // Identical to what the site has: nothing is lost by removing it, whoever
  // wrote it.
  const identical = stored.value?.snapshot === syncedSnapshot;

  // Otherwise it is an *intermediate* — something typed and then moved away
  // from, because the editor asking to clean up is by definition back at the
  // synced state. Ours to drop; somebody else's to leave alone, because that
  // tab may be in the middle of writing it.
  //
  // Without this, changing a field and pressing Reset left the undone version
  // on the device, and reopening the entry offered to restore it. A draft with
  // no owner recorded predates this and is treated as ours, which is what it
  // almost always is.
  const ours = !stored.writtenBy || stored.writtenBy === sender;

  if (!identical && !ours) return false;

  await deleteDraft(key);
  return true;
}

/**
 * The author has dealt with the offer — restored it or discarded it.
 *
 * The decision stops being "offer" and becomes an ordinary examined key, so
 * ordinary cleanup can resume. Without this a key stays permanently
 * un-tidyable for the rest of the session, and a copy identical to the site's
 * would sit in storage making sign-out warn about nothing.
 */
export function markRecoveryHandled(key: string): void {
  if (seen.has(key)) seen.set(key, { kind: "stale" });
}

/**
 * Forgets that a key was examined — for a route change onto a different
 * document, and for tests. Never a reason to delete anything.
 */
export function forgetRecoveryLookups(key?: string): void {
  if (key) seen.delete(key);
  else seen.clear();
}

/**
 * The version restored writing should be saved against.
 *
 * A draft carries the `updated_at` the editor held when it was written. If
 * that is missing — an old draft from before this was recorded — fall back to
 * what the page was served with, which is the previous behaviour and no worse.
 *
 * Silently adopting today's version instead would tell the server "I saw your
 * latest" on behalf of writing that saw nothing of the kind, and the conflict
 * screen that exists to show both versions would never open.
 */
export function restoreBase(
  recovered: { baseUpdatedAt: string | null },
  servedWith: string | null
): string | null {
  return recovered.baseUpdatedAt ?? servedWith;
}

/* ── the draft that follows a create to its real id ───────── */

/**
 * Moves a draft from "project:new" to "project:<id>".
 *
 * The source is removed only once the destination is genuinely on the device.
 * It used to be removed unconditionally: `writeDraft` returns false rather
 * than throwing when storage refuses — a full quota, site data switched off —
 * so a failed move deleted the only copy and reported nothing.
 */
export async function carryRecoveryOver(
  from: string,
  to: string,
  io: { write?: (draft: LocalDraft) => Promise<boolean> } = {}
): Promise<boolean> {
  if (from === to) return true;

  const stored = await readDraft<DraftValue>(from);
  if (!stored) {
    seen.delete(from);
    return true; // nothing to move is not a failure
  }

  const write = io.write ?? writeDraft;
  const written = await write({ ...stored, key: to, localId: to });
  if (!written) return false;

  // The moved copy is the same writing under a new name, so whatever was
  // decided about it still holds — carry the lookup across with it, or the
  // new key would be un-examined and cleanup would refuse for ever.
  const decision = seen.get(from);
  await deleteDraft(from);
  seen.delete(from);
  if (decision) seen.set(to, decision);
  return true;
}

/* ── writing the copy down, including on the way out ──────── */

/**
 * Debounced writes that survive the editor closing.
 *
 * The pause exists so a long body is not re-serialised on every keystroke.
 * The problem was what happened at the end of it: the timer was cleared when
 * the editor unmounted, and internal navigation unmounts without firing
 * `pagehide` or `visibilitychange`. Tapping a link a moment after typing threw
 * away the last thing written, and it was the only copy.
 *
 * So leaving flushes rather than cancels. There is nothing to lose by writing
 * one extra copy and everything to lose by skipping one.
 */
export function recoveryWriter() {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: LocalDraft | null = null;

  const write = async (): Promise<boolean> => {
    const draft = pending;
    pending = null;
    if (!draft) return false;
    return writeDraft(draft);
  };

  return {
    /** Replaces whatever was waiting; a burst of typing stays one write. */
    schedule(draft: LocalDraft, delayMs: number, onWritten?: (stored: boolean) => void) {
      pending = draft;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void write().then((stored) => onWritten?.(stored));
      }, delayMs);
    },
    /** Writes now, whatever the timer thought. Null when nothing was waiting. */
    async flush(): Promise<boolean | null> {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!pending) return null;
      return write();
    },
    /**
     * Throws away whatever is waiting, without writing it.
     *
     * Safe in exactly one situation, and the caller has to be in it: the
     * document is identical to what the site has. What is pending is then an
     * older intermediate the author has moved away from, and keeping it means
     * offering back an edit they undid. Everywhere else, leaving flushes.
     */
    async discard(): Promise<boolean> {
      if (timer) clearTimeout(timer);
      timer = null;
      const had = pending !== null;
      pending = null;
      return had;
    },

    /** What the editor calls on its way out. */
    async stop(): Promise<boolean | null> {
      return this.flush();
    },
  };
}

/* ── what signing out would destroy ───────────────────────── */

/**
 * Everything on this device that the site does not have.
 *
 * Sign-out clears Studio's storage, and the confirmation counted queued saves,
 * blocked saves and conflicts. It did not count recovery drafts or photographs
 * still waiting to upload — so the one category with no copy anywhere else was
 * the one the warning could not see, and a paragraph typed but never saved
 * went without a word.
 *
 * Deliberately a survey rather than a number: "3 changes" is a lie when it is
 * one queued save and two photographs, and the sentence the author reads
 * should be able to say which.
 */
export interface LocalWork {
  /** Saves waiting for a network. */
  queued: number;
  /** Saves the server refused, still holding the author's words. */
  blocked: number;
  conflicts: number;
  /** Photographs and clips still on this device. */
  media: number;
  /** Writing that never reached a queue at all. */
  drafts: number;
  total: number;
}

export async function surveyLocalWork(): Promise<LocalWork> {
  const [queue, conflicts, media, drafts] = await Promise.all([
    listQueue(),
    listConflicts(),
    listPendingMedia(),
    listDrafts(),
  ]);

  const work: LocalWork = {
    queued: queue.filter((entry) => !entry.blocked).length,
    blocked: queue.filter((entry) => entry.blocked).length,
    conflicts: conflicts.length,
    media: media.length,
    drafts: drafts.length,
    total: 0,
  };
  work.total = work.queued + work.blocked + work.conflicts + work.media + work.drafts;
  return work;
}

/** The sentence the sign-out confirmation shows, or null when there is nothing. */
export function describeLocalWork(work: LocalWork): string | null {
  if (work.total === 0) return null;

  const parts: string[] = [];
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  if (work.queued) parts.push(plural(work.queued, "queued save"));
  if (work.blocked) parts.push(plural(work.blocked, "refused save"));
  if (work.conflicts) parts.push(plural(work.conflicts, "unresolved conflict"));
  if (work.media) parts.push(plural(work.media, "file", "files") + " still uploading");
  if (work.drafts) parts.push(plural(work.drafts, "unsaved draft"));

  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return `${list} ${parts.length === 1 && work.total === 1 ? "is" : "are"} only on this device.`;
}
