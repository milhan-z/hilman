"use client";

import {
  describeConflict,
  rebaseQueued,
  type SyncMutation,
  type SyncOutcome,
  type SyncResponse,
} from "../studio-sync-contract";
import { conflictKey, listConflicts, recordConflict } from "./conflicts";
import {
  blockEntry,
  dequeue,
  listQueue,
  markSending,
  recordAttempt,
  releaseStaleSends,
  replaceQueue,
  type QueuedMutation,
} from "./outbox";
import { touchSnapshot } from "./snapshots";
import { flushPendingMedia, listPendingMedia } from "./media";
import { listDrafts, writeDraft } from "./drafts";
import { hasPendingRefs, replacePendingRefs } from "../studio-media-refs";

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

/** Stepped, capped. A phone in a lift should not hammer the origin. */
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000];

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
    next.lastError === state.lastError
  ) {
    return;
  }
  state = next;
  for (const listener of listeners) listener(state);
}

/* ── what the editor hears back ───────────────────────────── */

export interface AppliedSave {
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

  const batch = sendable.slice(0, BATCH);
  setState({ syncing: true, lastError: null });
  await Promise.all(batch.map((entry) => markSending(entry.mutationId, true)));

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ mutations: batch.map(stripLocalFields) }),
    });
  } catch {
    // A rejected fetch is the one signal that really means "no network".
    await Promise.all(batch.map((entry) => recordAttempt(entry.mutationId)));
    setState({ syncing: false, reachable: false, lastError: null });
    await refreshSyncState();
    scheduleRetry();
    return state;
  }

  if (!response.ok) {
    const message = await readError(response);

    // Only refuse to retry when the request itself is the problem. A 401 or
    // 403 means the session went away and the next sign-in fixes it; a 5xx
    // means the server had a bad moment. Blocking the queue on either of
    // those would strand work behind an error the editor cannot act on.
    const worthRetrying =
      response.status === 401 || response.status === 403 || response.status >= 500;

    await Promise.all(
      batch.map((entry) =>
        worthRetrying
          ? recordAttempt(entry.mutationId, message)
          : blockEntry(entry.mutationId, message)
      )
    );
    setState({ syncing: false, reachable: true, lastError: message });
    await refreshSyncState();
    if (worthRetrying) scheduleRetry();
    return state;
  }

  consecutiveFailures = 0;
  cancelRetry();

  const payload = (await response.json().catch(() => null)) as SyncResponse | null;
  const results = payload?.results ?? [];

  for (const outcome of results) await applyOutcome(outcome, batch);

  // "Last synced" has to mean something actually reached the site. A round
  // trip where every entry came back refused is contact with the server, not a
  // sync, and dating it would tell you your work is safer than it is.
  const savedSomething = results.some((result) => result.status === "saved");

  setState({
    syncing: false,
    reachable: true,
    ...(savedSomething ? { lastSyncedAt: new Date().toISOString() } : {}),
    lastError: results.find((r) => r.status === "rejected")?.message ?? null,
  });
  await refreshSyncState();

  // More was waiting than fitted in one batch, or something is still waiting
  // on a photo — either way, come back for it.
  const remaining = (await listQueue()).filter((entry) => !entry.blocked);
  if (remaining.length > 0) scheduleRetry(waitingOnPhotos > 0 ? undefined : 0);

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
  if (stashed.filter((item) => !item.blocked).length === 0) return { offline: false };

  setState({ syncing: true });
  const { resolved, offline } = await flushPendingMedia();
  if (Object.keys(resolved).length === 0) return { offline };

  const queue = await listQueue();
  const rewritten = queue.map((entry) => replacePendingRefs(entry, resolved));
  if (JSON.stringify(queue) !== JSON.stringify(rewritten)) await replaceQueue(rewritten);

  for (const draft of await listDrafts()) {
    const next = replacePendingRefs(draft, resolved);
    if (JSON.stringify(next) !== JSON.stringify(draft)) await writeDraft(next);
  }

  emit({ type: "media", resolved });
  return { offline };
}

async function applyOutcome(outcome: SyncOutcome, batch: QueuedMutation[]) {
  const entry = batch.find((item) => item.mutationId === outcome.mutationId);

  if (outcome.status === "saved") {
    await dequeue(outcome.mutationId);

    // Everything still queued for this row was written on top of what we just
    // saved, so it is rebased rather than left to conflict with our own work.
    const rest = (await listQueue()).filter((item) => item.mutationId !== outcome.mutationId);
    const rebased = rebaseQueued(rest, {
      localId: outcome.localId,
      entity: entry?.entity ?? "journal",
      id: outcome.id,
      updatedAt: outcome.updatedAt,
    });
    if (JSON.stringify(rest) !== JSON.stringify(rebased)) await replaceQueue(rebased);

    await touchSnapshot(entry?.entity ?? "journal", outcome.id, outcome.updatedAt, {
      title: String(entry?.payload.fields.title ?? ""),
      status: String(entry?.payload.fields.status ?? "draft"),
    });

    emit({
      type: "applied",
      save: {
        localId: outcome.localId,
        entity: entry?.entity ?? "journal",
        id: outcome.id,
        updatedAt: outcome.updatedAt,
      },
    });
    return;
  }

  if (outcome.status === "conflict") {
    await dequeue(outcome.mutationId);
    if (entry) {
      await recordConflict({
        key: conflictKey(entry.entity, outcome.id),
        entity: entry.entity,
        id: outcome.id,
        mine: entry.payload,
        server: outcome.server,
        differences: describeConflict(entry.payload, outcome.server),
        noticedAt: new Date().toISOString(),
      });
      emit({ type: "conflict", entity: entry.entity, id: outcome.id, localId: outcome.localId });
    }
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
    setState({ reachable: true, lastError: message });
    return { status: "rejected", mutationId: mutation.mutationId, localId: mutation.localId, message };
  }

  const payload = (await response.json().catch(() => null)) as SyncResponse | null;
  const outcome = payload?.results?.[0] ?? null;

  if (outcome?.status === "saved") {
    await touchSnapshot(mutation.entity, outcome.id, outcome.updatedAt, {
      title: String(mutation.payload.fields.title ?? ""),
      status: String(mutation.payload.fields.status ?? "draft"),
    });
    setState({ reachable: true, lastSyncedAt: new Date().toISOString(), lastError: null });
    emit({
      type: "applied",
      save: {
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
  const { sending: _sending, blocked: _blocked, lastError: _lastError, ...mutation } = entry;
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
}

function scheduleRetry(delay?: number) {
  if (retryTimer) clearTimeout(retryTimer);
  const wait =
    delay ?? BACKOFF_MS[Math.min(consecutiveFailures++, BACKOFF_MS.length - 1)];
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushOutbox();
  }, wait);
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
  void releaseStaleSends()
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
