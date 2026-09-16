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
}): PinDecision {
  const attempts = input.attempts ?? NO_ATTEMPTS;
  const now = input.now ?? Date.now();
  const expected = (input.expected ?? "").trim();
  const entered = input.entered.trim();

  // A missing or malformed STUDIO_PIN must never be treated as "any PIN works".
  if (!isWellFormed(expected)) {
    return {
      attempts,
      gate: {
        ok: false,
        reason: "unconfigured",
        message: `PIN sign-in isn't set up. Put a ${PIN_LENGTH}-digit STUDIO_PIN in .env.local, or use your email and password.`,
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
    const locked = failures >= MAX_ATTEMPTS;
    return {
      attempts: { failures: locked ? 0 : failures, lockedUntil: locked ? now + LOCKOUT_MS : 0 },
      gate: {
        ok: false,
        reason: locked ? "locked" : "wrong",
        message: locked
          ? `Too many wrong PINs. Try again in ${Math.round(LOCKOUT_MS / 60_000)} minutes, or sign in with your email and password.`
          : `That PIN doesn't open this door. ${MAX_ATTEMPTS - failures} ${MAX_ATTEMPTS - failures === 1 ? "try" : "tries"} left.`,
      },
    };
  }

  return { attempts: NO_ATTEMPTS, gate: { ok: true } };
}
