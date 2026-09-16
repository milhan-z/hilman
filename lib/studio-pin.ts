import { createHash, timingSafeEqual } from "node:crypto";

/**
 * PIN sign-in for the studio.
 *
 * The PIN is a convenience, not the security boundary. It unlocks a real
 * Supabase sign-in performed on the server, so RLS and is_site_owner() still
 * decide what may be written. Six digits is only a million combinations, which
 * is why wrong attempts lock the door rather than merely failing.
 */

export const PIN_LENGTH = 6;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * A second, wider net counted across every device at once.
 *
 * Per-device counting alone is beatable: a million guesses spread over enough
 * addresses never trips a five-try limit on any one of them. This bucket is
 * deliberately loose enough that the owner's own fumbled attempts from a few
 * places will not trip it.
 */
export const GLOBAL_MAX_ATTEMPTS = 20;

export type PinGate =
  | { ok: true }
  | {
      ok: false;
      reason: "unconfigured" | "malformed" | "wrong" | "locked";
      message: string;
    };

export interface PinAttempts {
  failures: number;
  /** Epoch ms; 0 when the door is open. */
  lockedUntil: number;
}

export const NO_ATTEMPTS: PinAttempts = { failures: 0, lockedUntil: 0 };

const isWellFormed = (value: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(value);

/** Compare hashes of equal length so a wrong PIN never leaks how far it matched. */
function sameSecret(entered: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(entered).digest(),
    createHash("sha256").update(expected).digest()
  );
}

export interface PinDecision {
  gate: PinGate;
  /** Store this back; the caller owns where attempts live. */
  attempts: PinAttempts;
}

export function checkPin(input: {
  entered: string;
  expected: string | undefined;
  attempts?: PinAttempts;
  now?: number;
  /** Failures allowed before the door locks. Defaults to MAX_ATTEMPTS. */
  maxAttempts?: number;
  /** How long the lockout lasts. Defaults to LOCKOUT_MS. */
  lockoutMs?: number;
}): PinDecision {
  const attempts = input.attempts ?? NO_ATTEMPTS;
  const now = input.now ?? Date.now();
  const maxAttempts = input.maxAttempts ?? MAX_ATTEMPTS;
  const lockoutMs = input.lockoutMs ?? LOCKOUT_MS;
  const expected = (input.expected ?? "").trim();
  const entered = input.entered.trim();

  // A missing or malformed STUDIO_PIN must never be treated as "any PIN works".
  if (!isWellFormed(expected)) {
    return {
      attempts,
      gate: {
        ok: false,
        reason: "unconfigured",
        message: `PIN sign-in isn't set up here. Set a ${PIN_LENGTH}-digit STUDIO_PIN in this environment — .env.local on your machine, project settings once deployed — or use your email and password.`,
      },
    };
  }

  if (attempts.lockedUntil > now) {
    const minutes = Math.max(1, Math.ceil((attempts.lockedUntil - now) / 60_000));
    return {
      attempts,
      gate: {
        ok: false,
        reason: "locked",
        message: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or sign in with your email and password.`,
      },
    };
  }

  // A typo of the wrong length is not an attempt; it cannot guess anything.
  if (!isWellFormed(entered)) {
    return {
      attempts,
      gate: { ok: false, reason: "malformed", message: `Enter all ${PIN_LENGTH} digits.` },
    };
  }

  if (!sameSecret(entered, expected)) {
    const failures = attempts.failures + 1;
    const locked = failures >= maxAttempts;
    return {
      attempts: { failures: locked ? 0 : failures, lockedUntil: locked ? now + lockoutMs : 0 },
      gate: {
        ok: false,
        reason: locked ? "locked" : "wrong",
        message: locked
          ? `Too many wrong PINs. Try again in ${Math.round(lockoutMs / 60_000)} minutes, or sign in with your email and password.`
          : `That PIN doesn't open this door. ${maxAttempts - failures} ${maxAttempts - failures === 1 ? "try" : "tries"} left.`,
      },
    };
  }

  return { attempts: NO_ATTEMPTS, gate: { ok: true } };
}

/* ── counting the same guess in more than one place ───────── */

export interface PinBucket {
  /** Row key in the durable store — a hashed address, or "global". */
  key: string;
  attempts: PinAttempts;
  maxAttempts: number;
  lockoutMs: number;
}

export interface PinBucketDecision {
  gate: PinGate;
  /** Store every one of these back; unchanged buckets are included too. */
  buckets: PinBucket[];
}

const remaining = (bucket: PinBucket) => bucket.maxAttempts - bucket.attempts.failures;

/**
 * One guess, counted against several limits at once — this device, and the
 * site as a whole.
 *
 * A locked bucket stops the guess before the PIN is compared, so a locked-out
 * attacker learns nothing from timing, and a correct PIN clears every bucket.
 * Nothing is counted for a malformed entry or an unconfigured PIN: neither one
 * is a guess.
 */
export function checkPinBuckets(input: {
  entered: string;
  expected: string | undefined;
  buckets: PinBucket[];
  now?: number;
}): PinBucketDecision {
  const now = input.now ?? Date.now();
  const unchanged = input.buckets;

  const probe = checkPin({
    entered: input.entered,
    expected: input.expected,
    attempts: NO_ATTEMPTS,
    now,
  });

  // Unconfigured and malformed are decided before any bucket is consulted:
  // there is nothing to count and nothing to lock.
  if (!probe.gate.ok && (probe.gate.reason === "unconfigured" || probe.gate.reason === "malformed")) {
    return { gate: probe.gate, buckets: unchanged };
  }

  const locked = input.buckets
    .filter((b) => b.attempts.lockedUntil > now)
    .sort((a, b) => b.attempts.lockedUntil - a.attempts.lockedUntil)[0];

  if (locked) {
    const minutes = Math.max(1, Math.ceil((locked.attempts.lockedUntil - now) / 60_000));
    return {
      gate: {
        ok: false,
        reason: "locked",
        message: `Too many wrong PINs. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}, or sign in with your email and password.`,
      },
      buckets: unchanged,
    };
  }

  if (probe.gate.ok) {
    return {
      gate: probe.gate,
      buckets: input.buckets.map((b) => ({ ...b, attempts: NO_ATTEMPTS })),
    };
  }

  // A wrong guess: count it everywhere, and report the limit closest to the edge.
  const decided = input.buckets.map((bucket) => {
    const decision = checkPin({
      entered: input.entered,
      expected: input.expected,
      attempts: bucket.attempts,
      maxAttempts: bucket.maxAttempts,
      lockoutMs: bucket.lockoutMs,
      now,
    });
    return { bucket: { ...bucket, attempts: decision.attempts }, gate: decision.gate };
  });

  const strictest =
    decided.find((d) => !d.gate.ok && d.gate.reason === "locked") ??
    [...decided].sort((a, b) => remaining(a.bucket) - remaining(b.bucket))[0];

  return {
    gate: strictest?.gate ?? probe.gate,
    buckets: decided.map((d) => d.bucket),
  };
}
