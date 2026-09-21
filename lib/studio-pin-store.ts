import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";

/**
 * Where PIN failures are counted, and why it is not here.
 *
 * ── the two versions this replaces ──
 *
 * First they lived in a module-level variable. That reads as a rate limiter
 * and is not one: every serverless instance keeps its own copy and a cold
 * start wipes it, so "five tries" really meant "five tries per warm instance,
 * until the next deploy".
 *
 * Then they lived in `studio_pin_attempts`, which fixed durability and left
 * the arithmetic in JavaScript:
 *
 *     read the counts  →  decide  →  write them back
 *
 * Three steps, two round trips, nothing holding anything in between. Two
 * attempts arriving together both read N, both decide N+1, and both write
 * N+1 — two guesses for the price of one. That is the protection on a
 * six-digit secret, which is a million combinations and not many.
 *
 * And when the table could not be read it fell back to the in-process counter
 * and carried on. A limiter that quietly becomes per-instance when the
 * database has a bad minute is a limiter that fails open at exactly the moment
 * it matters.
 *
 * ── what happens now ──
 *
 * One RPC, `studio_pin_attempt`, does the whole thing in one statement: it
 * takes each bucket's row with `for update`, counts, decides, and writes. A
 * second caller waits and then reads the first one's result.
 *
 * It *reserves* rather than reports — the attempt is counted before the PIN is
 * compared, and a correct PIN clears the counters afterwards. Counting first
 * is what makes it atomic at all; the alternative is holding a database lock
 * across the comparison.
 *
 * And it fails closed. If the limiter cannot be reached, PIN sign-in is
 * unavailable and says so. Email and password still work, so the owner is
 * never locked out of their own site — they just cannot use the shortcut that
 * depends on a working counter.
 */

export const GLOBAL_KEY = "global";

/** IPs are hashed: the table is a counter, not a visitor log. */
export function attemptKeyForAddress(address: string | null | undefined): string {
  const value = (address ?? "").trim();
  if (!value) return "unknown-address";
  return `ip:${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

/**
 * Best guess at who is knocking. Vercel sets x-forwarded-for; the leftmost
 * entry is the client. A spoofed value only ever splits an attacker's own
 * bucket, which is why the global bucket exists alongside it.
 */
export function addressFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip");
}

export interface PinBucketRequest {
  key: string;
  /** Failures allowed before this bucket shuts. */
  max: number;
  lockoutMs: number;
}

export type PinReservation =
  /** Counted. The guess may be compared. */
  | { status: "allowed"; remaining: number }
  /** Not compared, not counted — this door is already shut. */
  | { status: "locked"; lockedUntil: number }
  /**
   * The counter could not be reached, so nothing can be promised about how
   * many guesses have been made. PIN sign-in is refused rather than allowed
   * on trust — see the note above about failing open.
   */
  | { status: "unavailable"; message: string };

const UNAVAILABLE_MESSAGE =
  "PIN sign-in is unavailable right now because the attempt counter can't be reached. " +
  "Sign in with your email and password instead.";

/**
 * Counts one attempt against every bucket, atomically, before it is compared.
 *
 * `client` is injected only by tests, which need a limiter that refuses.
 */
export async function reservePinAttempt(
  buckets: PinBucketRequest[],
  client?: SupabaseClient | null
): Promise<PinReservation> {
  const supabase =
    client !== undefined ? client : serviceRoleConfigured ? createServiceSupabase() : null;

  // No service-role key means no durable counter. Previously this fell back to
  // a per-process Map and carried on, which is the failure this whole module
  // exists to end.
  if (!supabase) return { status: "unavailable", message: UNAVAILABLE_MESSAGE };

  const { data, error } = await supabase.rpc("studio_pin_attempt", {
    p_buckets: buckets.map((bucket) => ({
      key: bucket.key,
      max: bucket.max,
      lockoutSeconds: Math.max(1, Math.round(bucket.lockoutMs / 1000)),
    })),
  });

  if (error) {
    // Deliberately not logged with the attempt's details — the message the
    // owner sees says what to do instead, and the server log says what broke.
    console.error("[studio] PIN attempt could not be counted:", error.message);
    return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
  }

  const answer = data as { allowed?: boolean; remaining?: number; lockedUntil?: string } | null;
  if (!answer || typeof answer.allowed !== "boolean") {
    return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
  }

  if (!answer.allowed) {
    const until = answer.lockedUntil ? Date.parse(answer.lockedUntil) : Date.now();
    return { status: "locked", lockedUntil: Number.isNaN(until) ? Date.now() : until };
  }
  return { status: "allowed", remaining: Math.max(0, answer.remaining ?? 0) };
}

/**
 * Forgets the wrong guesses, because the right one arrived.
 *
 * Failing to clear is not worth refusing a correct PIN over: the counters
 * expire on their own, and the owner is already through the door.
 */
export async function clearPinAttempts(
  keys: string[],
  client?: SupabaseClient | null
): Promise<void> {
  const supabase =
    client !== undefined ? client : serviceRoleConfigured ? createServiceSupabase() : null;
  if (!supabase || keys.length === 0) return;

  const { error } = await supabase.rpc("studio_pin_clear", { p_keys: keys });
  if (error) console.error("[studio] could not clear PIN attempts:", error.message);
}
