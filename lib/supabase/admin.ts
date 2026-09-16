import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

/**
 * Service-role client. It bypasses RLS, so it must never run in a browser.
 *
 * Two things keep it there. The key is read from a variable without the
 * NEXT_PUBLIC_ prefix, which Next.js replaces with `undefined` in client
 * bundles, and the guard below refuses to build a client if this module is
 * somehow evaluated with a `window` present.
 *
 * Only one job needs it: the PIN rate limiter has to count failures *before*
 * anyone is signed in, and that counter must not be writable by the visitor
 * being counted. Everything else in the studio goes through the ordinary
 * session client so RLS stays the enforcement.
 */

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const serviceRoleConfigured = Boolean(SUPABASE_URL && serviceKey);

let cached: SupabaseClient | null = null;

export function createServiceSupabase(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("The service-role client is server-only.");
  }
  if (!serviceRoleConfigured) return null;
  cached ??= createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
