import { createHash } from "node:crypto";
import { createServiceSupabase, serviceRoleConfigured } from "@/lib/supabase/admin";
import { NO_ATTEMPTS, type PinAttempts } from "./studio-pin";

/**
 * Where PIN failures are counted.
 *
 * They used to live in a module-level variable. That reads as a rate limiter
 * and is not one: every serverless instance keeps its own copy and a cold
 * start wipes it, so "five tries" really meant "five tries per warm instance,
 * until the next deploy". The count now lives in `studio_pin_attempts`, which
 * only the service-role key can touch — a limiter the guesser can reset is
 * not a limiter.
 *
 * Without a service-role key configured the module falls back to the old
 * in-process counter and says so, so a missing key degrades loudly in the
 * logs instead of silently unlocking the door.
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

const memory = new Map<string, PinAttempts>();

const fromRow = (row: { failures: number | null; locked_until: string | null }): PinAttempts => ({
  failures: row.failures ?? 0,
  lockedUntil: row.locked_until ? new Date(row.locked_until).getTime() : 0,
});

export interface PinAttemptsRead {
  attempts: Record<string, PinAttempts>;
  /** False when the count only exists in this process — see the note above. */
  durable: boolean;
}

export async function readPinAttempts(keys: string[]): Promise<PinAttemptsRead> {
  const blank = Object.fromEntries(keys.map((key) => [key, NO_ATTEMPTS]));
  const supabase = serviceRoleConfigured ? createServiceSupabase() : null;

  if (!supabase) {
    return {
      durable: false,
      attempts: Object.fromEntries(keys.map((key) => [key, memory.get(key) ?? NO_ATTEMPTS])),
    };
  }

  const { data, error } = await supabase
    .from("studio_pin_attempts")
    .select("key, failures, locked_until")
    .in("key", keys);

  if (error) {
    console.error("[studio] could not read PIN attempts:", error.message);
    // Fail closed enough to stay useful: fall back to the in-process count
    // rather than treating an unreachable table as "no failures recorded".
    return {
      durable: false,
      attempts: Object.fromEntries(keys.map((key) => [key, memory.get(key) ?? NO_ATTEMPTS])),
    };
  }

  const attempts = { ...blank };
  for (const row of data ?? []) attempts[row.key] = fromRow(row);
  return { durable: true, attempts };
}

export async function writePinAttempts(
  entries: { key: string; attempts: PinAttempts }[]
): Promise<void> {
  for (const entry of entries) memory.set(entry.key, entry.attempts);

  const supabase = serviceRoleConfigured ? createServiceSupabase() : null;
  if (!supabase || entries.length === 0) return;

  const { error } = await supabase.from("studio_pin_attempts").upsert(
    entries.map((entry) => ({
      key: entry.key,
      failures: entry.attempts.failures,
      locked_until:
        entry.attempts.lockedUntil > 0 ? new Date(entry.attempts.lockedUntil).toISOString() : null,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "key" }
  );

  if (error) console.error("[studio] could not record a PIN attempt:", error.message);
}

/** Test seam — the in-process fallback is module state. */
export function __resetPinMemory() {
  memory.clear();
}
