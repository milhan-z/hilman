/**
 * Which failures are worth trying again, and how soon.
 *
 * ── the two opposite mistakes this replaces ──
 *
 * The upload path treated *anything the server answered* as permanent. Only a
 * rejected fetch counted as retryable:
 *
 *     const networkFailure = error instanceof TypeError || /Failed to fetch/…;
 *     …
 *     await update(item.ref, { blocked: true });   // everything else
 *
 * So a Cloudinary 503, a 429 while several photographs went up together, or a
 * session that expired while the phone was in a pocket all marked the
 * photograph permanently failed. It stayed on the device — nothing was
 * deleted — but it stopped trying, and the save holding its placeholder
 * stopped with it, until somebody noticed and pressed Retry.
 *
 * The sync path made the opposite mistake. It reset the backoff on any HTTP
 * 200, and an HTTP 200 from /api/studio/sync means only that the request
 * arrived — each mutation inside carries its own outcome, and `retry` is one
 * of them. A server answering 200 with a retryable outcome therefore produced
 * an immediate re-send, and then another, as fast as the connection allowed.
 *
 * Both are the same missing idea: the *class* of a failure, decided once and
 * named, rather than a boolean guessed at each call site.
 *
 * Deliberately a pure module — no fetch, no storage, no timers — so every rule
 * below can be tested by asking it a question.
 */

/** What went wrong, in the only five categories that lead to different actions. */
export type FailureClass =
  /** Nothing answered. Wait for a network rather than a clock. */
  | "offline"
  /** Something answered, eventually, but not in time. */
  | "timeout"
  /** Answered "not now": rate limits and overload. */
  | "busy"
  /** Answered "not you": the session lapsed. Recoverable by signing in. */
  | "auth"
  /** Answered "no", and will answer "no" again. */
  | "permanent";

export interface Failure {
  kind: FailureClass;
  /** Whether trying the identical request again could ever succeed. */
  retryable: boolean;
  /** Whether this is evidence that the network itself is unreachable. */
  offline: boolean;
  message: string;
}

/**
 * An HTTP failure that keeps its status.
 *
 * The upload helpers used to throw `new Error("Cloudinary upload failed: …")`,
 * which turned a 429 and a 415 into the same untyped string — so the only
 * thing left to classify on was whether fetch had rejected. The status is the
 * whole signal; it travels.
 */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly phase: "sign" | "transfer" | "record"
  ) {
    super(message);
    this.name = "UploadError";
  }
}

/** Raised when our own timeout fires, so it is not mistaken for a refusal. */
export class TimeoutError extends Error {
  constructor(message = "The request took too long and was given up on.") {
    super(message);
    this.name = "TimeoutError";
  }
}

const NETWORK_TEXT = /failed to fetch|networkerror|network request failed|load failed|ecconnreset|enotfound/i;

/**
 * Statuses worth trying again.
 *
 *   408  the server gave up waiting for us
 *   425  too early — it would rather we asked again
 *   429  rate limited, which several photographs at once can reach
 *   5xx  the other end had a bad moment
 *
 * 401 and 403 are handled separately: they are retryable, but only once the
 * session is valid again, and that is a different sentence for the author.
 */
const RETRYABLE_STATUS = new Set([408, 425, 429]);

export function classifyFailure(error: unknown): Failure {
  const message = String((error as { message?: unknown })?.message ?? error ?? "Something failed.");

  if (error instanceof TimeoutError || (error as { name?: string })?.name === "AbortError") {
    return { kind: "timeout", retryable: true, offline: false, message };
  }

  if (error instanceof UploadError) {
    const { status } = error;
    if (status === 401 || status === 403) {
      return {
        kind: "auth",
        retryable: true,
        offline: false,
        message: "Studio needs you to sign in again before this can go up.",
      };
    }
    if (RETRYABLE_STATUS.has(status) || status >= 500) {
      return { kind: "busy", retryable: true, offline: false, message };
    }
    // 0 means the error carried no status: treat it as something answered,
    // because a genuinely absent network is caught by the TypeError branch.
    return { kind: "permanent", retryable: false, offline: false, message };
  }

  // A rejected fetch is the one signal that really means "no network". The
  // text check is for engines whose rejection is not a TypeError.
  if (error instanceof TypeError || NETWORK_TEXT.test(message)) {
    return { kind: "offline", retryable: true, offline: true, message };
  }

  return { kind: "permanent", retryable: false, offline: false, message };
}

/** The upload path's name for the same decision. */
export const classifyUploadFailure = classifyFailure;

/* ── how long to wait ─────────────────────────────────────── */

/** Stepped and capped. A phone in a lift must not hammer the origin. */
export const BACKOFF_STEPS_MS = [5_000, 15_000, 30_000, 60_000, 120_000];

/** The most a retry will ever be delayed by. */
export const MAX_BACKOFF_MS = BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1];

/** How soon to look again when the hold-up is not a failure. */
export const DEFERRED_DELAY_MS = 5_000;

/**
 * What a round trip means for how soon to try again.
 *
 * `applied` alone is the only outcome that earns a clean slate. A response
 * that arrived is not the same as work that succeeded: /api/studio/sync
 * answers 200 with a per-mutation verdict, and `retry` inside a 200 used to
 * reset the backoff and schedule an immediate re-send — which is a tight loop
 * against a server that has just said it is not ready.
 */
export type RoundTrip =
  /** Everything in the batch landed. */
  | { kind: "applied" }
  /** The request arrived; at least one mutation asked to be tried again. */
  | { kind: "retry-outcome" }
  /** Nothing arrived, or the transport itself failed. */
  | { kind: "transport"; failure: Failure }
  /** Answered, and the answer will not change. Nothing to schedule. */
  | { kind: "settled" }
  /**
   * Nothing went out, for a reason that is not a failure: a save waiting on a
   * photograph that has not uploaded yet, or one another tab is already
   * carrying. Come back shortly, but do not call it an attempt — the count is
   * what the studio shows the author, and "attempt 6" is a lie when nothing
   * has gone wrong.
   */
  | { kind: "deferred" };

export interface BackoffState {
  /** How many times in a row we have come back without finishing the work. */
  failures: number;
}

export interface NextAttempt {
  failures: number;
  /** Null when nothing should be scheduled. */
  delayMs: number | null;
}

/**
 * The next delay, given what just happened.
 *
 * `jitter` is injected rather than read from Math.random() so the rule can be
 * tested exactly. In the app it is a small spread, so a phone waking several
 * timers at once does not send them all in the same millisecond.
 */
export function nextAttempt(
  state: BackoffState,
  trip: RoundTrip,
  options: { moreWaiting: boolean; jitter?: number } = { moreWaiting: false }
): NextAttempt {
  const jitter = options.jitter ?? Math.random();

  if (trip.kind === "applied") {
    // Work finished. Anything still queued may go straight away — it is not
    // waiting on a failure, only on its turn.
    return { failures: 0, delayMs: options.moreWaiting ? 0 : null };
  }

  if (trip.kind === "settled") {
    return { failures: 0, delayMs: options.moreWaiting ? 0 : null };
  }

  if (trip.kind === "deferred") {
    // The failure count is left exactly as it was, so an unrelated backoff
    // already in progress is neither reset nor advanced.
    const step =
      state.failures > 0
        ? BACKOFF_STEPS_MS[Math.min(state.failures - 1, BACKOFF_STEPS_MS.length - 1)]
        : DEFERRED_DELAY_MS;
    return { failures: state.failures, delayMs: Math.max(DEFERRED_DELAY_MS, step) };
  }

  const failures = state.failures + 1;
  const step = BACKOFF_STEPS_MS[Math.min(failures - 1, BACKOFF_STEPS_MS.length - 1)];
  // ±20%, so repeated failures do not settle into lockstep.
  const spread = Math.round(step * 0.2 * (jitter * 2 - 1));
  return { failures, delayMs: Math.max(1_000, step + spread) };
}
