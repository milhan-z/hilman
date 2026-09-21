"use client";

import {
  describeConflict,
  type SyncMutation,
  type SyncOutcome,
  type SyncResponse,
} from "../studio-sync-contract";
import { conflictKey, listConflicts } from "./conflicts";
import { moveQueuedToConflict } from "./transitions";
import {
  blockEntry,
  claimForSending,
  dequeue,
  listQueue,
  oneSavePerRow,
  rebaseAfterApplied,
  recordAttempt,
  releaseClaim,
  releaseStaleSends,
  senderId,
  type QueuedMutation,
} from "./outbox";
import { touchSnapshot } from "./snapshots";
import { flushPendingMedia, listPendingMedia, type PendingMedia } from "./media";
import {
  applyResolutions,
  listResolutions,
  unfinishedResolutions,
} from "./media-resolution";
import { hasPendingRefs } from "../studio-media-refs";
import type { RejectionReason } from "../studio-sync-contract";
import type { UploadNoun } from "../studio-editor-state";
import { SYNC_TIMEOUT_MS, fetchWithTimeout } from "./net";
import { classifyFailure, nextAttempt, type RoundTrip } from "./retry-policy";

/**
 * Getting the queue to the server.
 *
 * Connectivity is treated as a hint, never as proof. `navigator.onLine` only
 * knows whether a network interface is up — it says "online" on café WiFi that
 * has not been paid for. So the only thing that establishes reachability here
 * is a request that actually completed. The browser's events are used to
 * decide *when* to try, and the attempt itself decides what is true.
 *
 * Nothing here is allowed to lose work. A queued save leaves the queue for
 * exactly three reasons: the server saved it, the server reported a conflict
 * (which is then stored as a conflict), or the editor discarded it on purpose.
 */

const ENDPOINT = "/api/studio/sync";
const BATCH = 25;

/**
 * This tab, for claiming work.
 *
 * Read lazily rather than at module load: on the server there is no
 * sessionStorage, and this module is imported by components that render there.
 */
let cachedRealm: string | null = null;
const realm = () => (cachedRealm ??= senderId());


export interface SyncState {
  /** Our best evidence, not navigator.onLine — see above. */
  reachable: boolean;
  syncing: boolean;
  queued: number;
  blocked: number;
  conflicts: number;
  /** Photographs still on this device, waiting for a connection. */
  media: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  /**
   * What kind of refusal `lastError` was.
   *
   * Without it every failure reads "Couldn't sync", which is right for a
   * dropped connection and wrong for a document the site declined to publish
   * because it still contains the template's questions.
   */
  lastFailure: RejectionReason | null;
  /** Unanswered starter prompts, when that is why it was refused. */
  blockedPrompts: number;
  /**
   * Files still on this device: still going up, given up on, and what they are.
   *
   * `noun` exists because the queue stopped being photographs only. It is
   * "photo" when everything waiting is a photo, "clip" when everything waiting
   * is a loop clip, and "file" when it is both — which is what the status line
   * says out loud. See UploadNoun in lib/studio-editor-state.ts.
   */
  uploads: { pending: number; failed: number; noun: UploadNoun };
  /**
   * When the next automatic attempt is due, if one is scheduled.
   *
   * Here so the studio can say "trying again shortly" honestly rather than
   * implying it is working right now, and so a test can assert that a busy
   * server is given room instead of being hammered.
   */
  nextRetryAt: string | null;
  /** Consecutive round trips that did not finish the work. */
  attempt: number;
  /**
   * The session lapsed and nothing will go out until it is renewed.
   *
   * Distinct from `lastFailure: "AUTH_ERROR"`, which describes one refusal.
   * This is the standing condition, and it is what stops "couldn't sync" being
   * shown for something a sign-in would fix.
   */
  authRequired: boolean;
  /**
   * Files the provider accepted but the media library did not record.
   *
   * A real, separate state: the reference is correct and the page will render,
   * but the asset will not appear in the library until the bookkeeping is
   * retried. Reporting it as finished was how a file could exist remotely and
   * nowhere in the CMS with nothing saying so.
   */
  unrecordedMedia: number;
}

const initialState: SyncState = {
  reachable: true,
  syncing: false,
  queued: 0,
  blocked: 0,
  conflicts: 0,
  media: 0,
  lastSyncedAt: null,
  lastError: null,
  lastFailure: null,
  blockedPrompts: 0,
  uploads: { pending: 0, failed: 0, noun: "photo" },
  unrecordedMedia: 0,
  nextRetryAt: null,
  attempt: 0,
  authRequired: false,
};

let state: SyncState = initialState;
const listeners = new Set<(state: SyncState) => void>();

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(listener: (state: SyncState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setState(patch: Partial<SyncState>) {
  const next = { ...state, ...patch };
  if (
    next.reachable === state.reachable &&
    next.syncing === state.syncing &&
    next.queued === state.queued &&
    next.blocked === state.blocked &&
    next.conflicts === state.conflicts &&
    next.media === state.media &&
    next.lastSyncedAt === state.lastSyncedAt &&
    next.lastError === state.lastError &&
    next.unrecordedMedia === state.unrecordedMedia &&
    next.nextRetryAt === state.nextRetryAt &&
    next.attempt === state.attempt &&
    next.authRequired === state.authRequired
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener(state);
}

/* ── what the editor hears back ───────────────────────────── */

export interface AppliedSave {
  /**
   * Which exact save the server accepted.
   *
   * The event used to carry only `localId`, which names the *document*, not
   * the save. An editor hearing "your journal:abc save landed" had no way to
   * tell whether that was the version currently on screen or one from two
   * edits ago, so it marked whatever it was holding as synced. With one id per
   * immutable payload — see lib/studio-local/outbox.ts — this answers the
   * question exactly.
   */
  mutationId: string;
  localId: string;
  entity: "project" | "journal";
  id: string;
  updatedAt: string;
}

type SyncEvent =
  | { type: "applied"; save: AppliedSave }
  | { type: "conflict"; entity: "project" | "journal"; id: string; localId: string }
  | { type: "blocked"; localId: string; message: string }
  /** A stashed photo is now a real Cloudinary id; open editors should swap it. */
  | { type: "media"; resolved: Record<string, string> };

const eventListeners = new Set<(event: SyncEvent) => void>();

export function subscribeSyncEvents(listener: (event: SyncEvent) => void): () => void {
  eventListeners.add(listener);
  return () => eventListeners.delete(listener);
}

const emit = (event: SyncEvent) => {
  for (const listener of eventListeners) listener(event);
};

/* ── counting what is waiting ─────────────────────────────── */

/**
 * The word for whatever is in the queue.
 *
 * Only what is actually waiting counts. An empty queue answers "photo" because
 * the noun is unused in that case and photographs are the ordinary thing; a
 * mixed queue answers "file" rather than picking a side.
 */
export function uploadNoun(media: PendingMedia[]): UploadNoun {
  if (media.length === 0) return "photo";
  const clips = media.filter((m) => m.kind === "loop-clip").length;
  if (clips === 0) return "photo";
  if (clips === media.length) return "clip";
  return "file";
}

export async function refreshSyncState(): Promise<SyncState> {
  const [queue, conflicts, media] = await Promise.all([
    listQueue(),
    listConflicts(),
    listPendingMedia(),
  ]);
  setState({
    queued: queue.filter((entry) => !entry.blocked).length,
    blocked: queue.filter((entry) => entry.blocked).length + media.filter((m) => m.blocked).length,
    conflicts: conflicts.length,
    media: media.filter((m) => !m.blocked).length,
    // Split, because "still going up" and "gave up" need different sentences
    // and different buttons — see FailureKind in lib/studio-editor-state.ts.
    uploads: {
      pending: media.filter((m) => !m.blocked).length,
      failed: media.filter((m) => m.blocked).length,
      noun: uploadNoun(media),
    },
  });
  return state;
}

/* ── the flush ────────────────────────────────────────────── */

let inFlight: Promise<SyncState> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let consecutiveFailures = 0;

/**
 * Sends everything sendable, once.
 *
 * Concurrent callers share one request: the online event, a regained tab focus
 * and a finished save can all land within the same second, and three copies of
 * the same queue in flight is how a double write gets invented.
 */
export function flushOutbox(): Promise<SyncState> {
  inFlight ??= runFlush().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function runFlush(): Promise<SyncState> {
  // Photographs go first. A save that still names a `pending:` placeholder is
  // held back below, so uploading the bytes is what unblocks the writing.
  const media = await sendStashedPhotos();

  const queue = (await listQueue()).filter((entry) => !entry.blocked);
  await refreshSyncState();

  if (queue.length === 0) {
    // sendStashedPhotos() may have raised the flag; nothing else will lower it.
    setState({ syncing: false, ...(media.offline ? { reachable: false } : {}) });
    if (media.offline) scheduleRetry();
    else cancelRetry();
    return state;
  }

  // A payload naming a photo that is still on this phone must not be sent: the
  // site would store a reference no visitor could ever resolve. It waits for
  // the upload instead, which is a delay rather than a loss.
  const sendable = queue.filter((entry) => !hasPendingRefs(entry.payload));
  const waitingOnPhotos = queue.length - sendable.length;

  if (sendable.length === 0) {
    setState({
      syncing: false,
      ...(media.offline ? { reachable: false } : {}),
      lastError: null,
    });
    scheduleRetry();
    return state;
  }

  // One save per row: two mutations for the same document cannot go in one
  // request without the second conflicting with the first. See oneSavePerRow().
  const candidates = oneSavePerRow(sendable).slice(0, BATCH);

  // Claim each one before it goes anywhere. Another tab may be carrying it
  // already, in which case this one leaves it alone rather than sending the
  // same save down a second connection. See claimForSending().
  const claimed = await Promise.all(
    candidates.map(async (entry) => ((await claimForSending(entry.mutationId, realm())) ? entry : null))
  );
  const batch = claimed.filter((entry): entry is QueuedMutation => entry !== null);

  if (batch.length === 0) {
    // Everything sendable belongs to another tab right now. Not an error and
    // not offline — just somebody else's turn.
    setState({ syncing: false });
    scheduleRetry();
    return state;
  }

  setState({ syncing: true, lastError: null });

  let response: Response;
  try {
    response = await fetchWithTimeout(
      ENDPOINT,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ mutations: batch.map(stripLocalFields) }),
      },
      SYNC_TIMEOUT_MS
    );
  } catch (error) {
    // Nothing came back, or nothing came back in time. Either way the work is
    // still here: hand the claims back so this tab is not the only one that
    // could ever carry them, and let the idempotency ledger make the retry
    // safe if the request did in fact arrive.
    const failure = classifyFailure(error);
    await Promise.all(
      batch.map(async (entry) => {
        await recordAttempt(entry.mutationId, failure.kind === "timeout" ? failure.message : undefined);
        await releaseClaim(entry.mutationId, realm());
      })
    );
    setState({
      syncing: false,
      reachable: !failure.offline,
      lastError: failure.kind === "timeout" ? failure.message : null,
    });
    await refreshSyncState();
    scheduleFrom({ kind: "transport", failure }, true);
    return state;
  }

  if (!response.ok) {
    const message = await readError(response);

    // Only refuse to retry when the request itself is the problem. A 401 or
    // 403 means the session went away and the next sign-in fixes it; a 5xx
    // means the server had a bad moment. Blocking the queue on either of
    // those would strand work behind an error the editor cannot act on.
    const needsAuth = response.status === 401 || response.status === 403;
    const worthRetrying = needsAuth || response.status === 429 || response.status >= 500;

    await Promise.all(
      batch.map(async (entry) => {
        if (worthRetrying) await recordAttempt(entry.mutationId, message);
        else await blockEntry(entry.mutationId, message);
        // Either way this tab is done carrying it.
        await releaseClaim(entry.mutationId, realm());
      })
    );
    setState({
      syncing: false,
      reachable: true,
      lastError: message,
      authRequired: needsAuth,
    });
    await refreshSyncState();
    if (worthRetrying) {
      scheduleFrom({ kind: "retry-outcome" }, true);
    } else {
      scheduleFrom({ kind: "settled" }, false);
    }
    return state;
  }

  const payload = (await response.json().catch(() => null)) as SyncResponse | null;
  const results = payload?.results ?? [];

  for (const outcome of results) await applyOutcome(outcome, batch);

  // Anything from this batch still in the queue is no longer ours to carry.
  // Without this a mutation the server asked us to retry stays claimed by a
  // tab that has finished with it, and no other tab may pick it up until the
  // lease expires.
  await Promise.all(batch.map((entry) => releaseClaim(entry.mutationId, realm())));

  // "Last synced" has to mean something actually reached the site. A round
  // trip where every entry came back refused is contact with the server, not a
  // sync, and dating it would tell you your work is safer than it is.
  const savedSomething = results.some((result) => result.status === "saved");
  const rejected = results.find((result) => result.status === "rejected");

  setState({
    syncing: false,
    reachable: true,
    authRequired: false,
    ...(savedSomething ? { lastSyncedAt: new Date().toISOString() } : {}),
    lastError: rejected?.message ?? null,
    lastFailure: rejected?.reason ?? (rejected ? "SERVER_ERROR" : null),
    blockedPrompts: rejected?.prompts ?? 0,
  });
  await refreshSyncState();

  // A row held back above is now rebased onto what just landed, so it may go
  // straight away. A mutation the *server* asked us to retry may not: an HTTP
  // 200 carrying a `retry` verdict is the server saying "not now", and reading
  // it as success is what produced a zero-delay re-send loop.
  const remaining = (await listQueue()).filter((entry) => !entry.blocked);
  const askedToRetry = results.some((result) => result.status === "retry");
  const trip: RoundTrip = askedToRetry
    ? { kind: "retry-outcome" }
    : savedSomething
      ? { kind: "applied" }
      : { kind: "settled" };

  scheduleFrom(trip, remaining.length > 0 || waitingOnPhotos > 0);

  return state;
}

/**
 * Uploads the photographs stashed on this device and rewrites every reference
 * to them — in the queue, and in the drafts still open in an editor.
 *
 * The rewrite has to cover both. The queue is what reaches the server; the
 * drafts are what the editor will submit next. Missing either would leave a
 * placeholder pointing at a photo that has already been uploaded.
 */
async function sendStashedPhotos(): Promise<{ offline: boolean }> {
  const stashed = await listPendingMedia();
  const carried = await unfinishedResolutions();

  // Uploads waiting, or paperwork from a previous run that never finished.
  // The second is the case the old code could not even represent: the mapping
  // from placeholder to remote id lived in a local variable, so being killed
  // after the bytes were released left a reference nothing could resolve.
  if (stashed.filter((item) => !item.blocked).length === 0 && carried.length === 0) {
    return { offline: false };
  }

  setState({ syncing: true });
  const { resolved, offline, unrecorded } = await flushPendingMedia();
  if (Object.keys(resolved).length === 0) return { offline };

  // Rewrites the queue, the recovery drafts *and* the stored conflicts, then
  // verifies by reading them back before forgetting the mapping. See
  // lib/studio-local/media-resolution.ts.
  await applyResolutions(await listResolutions());

  setState({
    // Files the provider took but the media library did not record. The
    // reference is correct and the asset is usable; only the bookkeeping is
    // missing, and saying nothing would make that look like a clean finish.
    unrecordedMedia: Object.keys(unrecorded).length,
  });

  emit({ type: "media", resolved });
  return { offline };
}

async function applyOutcome(outcome: SyncOutcome, batch: QueuedMutation[]) {
  const entry = batch.find((item) => item.mutationId === outcome.mutationId);

  if (outcome.status === "saved") {
    // Removing the applied entry and rebasing everything still queued for that
    // row happen together, in one transaction. As two steps — dequeue, read
    // the queue, write the whole queue back — a save made in between was
    // written, reported safe, and then erased by the write-back.
    await rebaseAfterApplied(outcome.mutationId, {
      localId: outcome.localId,
      entity: entry?.entity ?? "journal",
      id: outcome.id,
      updatedAt: outcome.updatedAt,
    });

    await touchSnapshot(entry?.entity ?? "journal", outcome.id, outcome.updatedAt, {
      title: String(entry?.payload.fields.title ?? ""),
      status: String(entry?.payload.fields.status ?? "draft"),
    });

    emit({
      type: "applied",
      save: {
        mutationId: outcome.mutationId,
        localId: outcome.localId,
        entity: entry?.entity ?? "journal",
        id: outcome.id,
        updatedAt: outcome.updatedAt,
      },
    });
    return;
  }

  if (outcome.status === "conflict") {
    // Nothing in this batch matches the answer, so there is no payload to
    // describe the conflict with. Leaving it queued is the only safe move:
    // dequeuing it — which is what this used to do — would discard writing
    // without recording it anywhere.
    if (!entry) {
      await recordAttempt(outcome.mutationId, "The server answered about a save we no longer hold.");
      return;
    }

    // Out of the queue and into the conflicts in one transaction. As two
    // steps, with the dequeue first, a conflict that could not be written --
    // a full quota, site data switched off -- left the writing nowhere at all,
    // silently, because IndexedDB refuses by returning rather than raising.
    const moved = await moveQueuedToConflict(outcome.mutationId, {
      key: conflictKey(entry.entity, outcome.id),
      entity: entry.entity,
      id: outcome.id,
      mine: entry.payload,
      server: outcome.server,
      differences: describeConflict(entry.payload, outcome.server),
      noticedAt: new Date().toISOString(),
    });

    if (!moved) {
      // The save is still queued, which is where it should be. Say so rather
      // than reporting a conflict the author cannot open.
      await recordAttempt(
        outcome.mutationId,
        "This browser would not store the conflicting versions, so the save is still waiting here."
      );
      return;
    }

    emit({ type: "conflict", entity: entry.entity, id: outcome.id, localId: outcome.localId });
    return;
  }

  if (outcome.status === "rejected") {
    await blockEntry(outcome.mutationId, outcome.message);
    emit({ type: "blocked", localId: outcome.localId, message: outcome.message });
    return;
  }

  await recordAttempt(outcome.mutationId, outcome.message);
}

/**
 * Sends one save without going through the queue.
 *
 * The queue is the only path for a browser that has storage; this is for the
 * one that does not — Safari's private mode, or site data switched off. There
 * the outbox write silently fails, and pretending it succeeded would mean
 * telling someone their writing is on their phone when it is nowhere at all.
 * So the save goes straight out and the answer is reported honestly, including
 * "this could not be saved".
 */
export async function sendDirect(mutation: SyncMutation): Promise<SyncOutcome | null> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ mutations: [mutation] }),
    });
  } catch {
    setState({ reachable: false });
    return null;
  }

  if (!response.ok) {
    const message = await readError(response);
    setState({ reachable: true, lastError: message, lastFailure: "SERVER_ERROR" });
    return { status: "rejected", mutationId: mutation.mutationId, localId: mutation.localId, message };
  }

  const payload = (await response.json().catch(() => null)) as SyncResponse | null;
  const outcome = payload?.results?.[0] ?? null;

  if (outcome?.status === "saved") {
    await touchSnapshot(mutation.entity, outcome.id, outcome.updatedAt, {
      title: String(mutation.payload.fields.title ?? ""),
      status: String(mutation.payload.fields.status ?? "draft"),
    });
    setState({
      reachable: true,
      lastSyncedAt: new Date().toISOString(),
      lastError: null,
      lastFailure: null,
      blockedPrompts: 0,
    });
    emit({
      type: "applied",
      save: {
        mutationId: outcome.mutationId,
        localId: outcome.localId,
        entity: mutation.entity,
        id: outcome.id,
        updatedAt: outcome.updatedAt,
      },
    });
  } else {
    setState({ reachable: true });
  }

  return outcome;
}

/** Only the fields the server's contract knows about. */
function stripLocalFields(entry: QueuedMutation) {
  const {
    sending: _sending,
    blocked: _blocked,
    attemptedAt: _attemptedAt,
    lastError: _lastError,
    ...mutation
  } = entry;
  return mutation;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (body && typeof body.error === "string") return body.error;
  } catch {
    /* fall through to the status line */
  }
  return `The studio server answered ${response.status}.`;
}

/* ── when to try again ────────────────────────────────────── */

function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  consecutiveFailures = 0;
  setState({ nextRetryAt: null, attempt: 0 });
}

/**
 * Decides when to come back, from what the round trip actually achieved.
 *
 * The rule this replaces read the *transport*: any HTTP 200 reset the failure
 * count, and then, because something was still queued, scheduled the next
 * attempt with a delay of zero. But a 200 from /api/studio/sync only means the
 * request arrived — every mutation inside carries its own verdict, and `retry`
 * is one of them. A server having a bad minute therefore received requests as
 * fast as the phone could produce them.
 *
 * See nextAttempt() in retry-policy.ts for the arithmetic; this is only the
 * timer and the state it reports.
 */
function scheduleFrom(trip: RoundTrip, moreWaiting: boolean) {
  const next = nextAttempt({ failures: consecutiveFailures }, trip, { moreWaiting });
  consecutiveFailures = next.failures;

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;

  if (next.delayMs === null) {
    setState({ nextRetryAt: null, attempt: next.failures });
    return;
  }

  setState({
    nextRetryAt: new Date(Date.now() + next.delayMs).toISOString(),
    attempt: next.failures,
  });
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox();
  }, next.delayMs);
  // A pending retry is not a reason to stay alive. Browsers have no unref, so
  // this is a no-op there; under Node it stops a scheduled retry holding the
  // test runner open for two minutes.
  (retryTimer as { unref?: () => void }).unref?.();
}

/** Kept for the callers that only mean "come back when you can". */
function scheduleRetry(delay?: number) {
  if (delay === 0) {
    scheduleFrom({ kind: "applied" }, true);
    return;
  }
  scheduleFrom({ kind: "retry-outcome" }, true);
}

/**
 * The moments worth retrying on.
 *
 * Background Sync is deliberately not the mechanism: Safari does not implement
 * it, and this studio's one user is on an iPhone. These four events cover
 * everything that actually happens — the network comes back, the app is
 * reopened, the tab is returned to, or the editor asks.
 */
export function installSyncTriggers(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => {
    setState({ reachable: true });
    void flushOutbox();
  };
  const onOffline = () => setState({ reachable: false });
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushOutbox();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);

  // A tab closed mid-request leaves entries marked as sending; clear them
  // before the first flush so they can be collapsed and sent normally again.
  void releaseStaleSends(realm())
    .then(refreshSyncState)
    .then(() => void flushOutbox());

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
    cancelRetry();
  };
}
