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

/*
   Counting a guess against several buckets used to live here, as
   checkPinBuckets(). It is the database's job now — see
   supabase/migrations/0011_atomic_pin_throttle.sql and
   lib/studio-pin-store.ts.

   Not a tidy-up: reading a count, deciding in JavaScript and writing it back
   is three steps with nothing holding anything in between, so two attempts
   arriving together both read N and both wrote N+1. Two guesses for the price
   of one, against a six-digit secret. The arithmetic had to move somewhere it
   could take a row lock, and this file cannot.

   What stays here is what the database has no business knowing: whether a PIN
   is configured at all, whether an entry is even shaped like a guess, and the
   comparison itself. The secret never leaves the application.
*/
