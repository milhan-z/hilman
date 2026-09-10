import { cache } from "react";
import { createServerSupabase, getRequestUser } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";

/**
 * Who is allowed to run the CMS.
 *
 * Being signed in is not the same as owning the site: `authenticated` only
 * means an account exists. Ownership is a row in `site_owners`, a table the
 * app has no policy to read or write — see migration 0003.
 *
 * Every mutating server action and the upload-signing route call this. RLS
 * enforces the same rule at the database, so a route that slipped past
 * middleware still cannot write.
 *
 * Memoised per request: the admin layout, the page it renders, and any helper
 * that asks all get one `auth.getUser()` and one `is_site_owner()` between
 * them, instead of a fresh pair of round-trips each.
 */

export type OwnerCheck =
  | { ok: true; userId: string; degraded: boolean }
  | { ok: false; reason: "unconfigured" | "unauthenticated" | "not-owner"; message: string };

/** Postgres/PostgREST codes meaning "is_site_owner() isn't in the database yet". */
const MISSING_FUNCTION = new Set(["42883", "PGRST202", "PGRST203"]);

export const checkOwner = cache(async function checkOwner(): Promise<OwnerCheck> {
  if (!supabaseConfigured) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Supabase isn't configured, so there's nothing to sign in to.",
    };
  }

  const supabase = createServerSupabase();
  const user = await getRequestUser();
  if (!user) {
    return { ok: false, reason: "unauthenticated", message: "Please sign in again." };
  }

  const { data, error } = await supabase.rpc("is_site_owner");

  if (error) {
    if (MISSING_FUNCTION.has(error.code ?? "")) {
      // Migration 0003 hasn't been applied. Don't lock the owner out of their
      // own CMS — but say so loudly, and let the UI show a banner.
      console.warn(
        "[owner] is_site_owner() is missing — owner enforcement is NOT active. " +
          "Apply supabase/migrations/0003_owner_and_integrity.sql."
      );
      return { ok: true, userId: user.id, degraded: true };
    }
    console.error("[owner] ownership check failed:", error.message);
    return { ok: false, reason: "not-owner", message: "Could not verify site ownership." };
  }

  if (data !== true) {
    return {
      ok: false,
      reason: "not-owner",
      message: "This account is signed in but isn't the site owner.",
    };
  }
  return { ok: true, userId: user.id, degraded: false };
});

/** True when the ownership rule is only being enforced by the app, not the database. */
export async function ownerEnforcementDegraded(): Promise<boolean> {
  const check = await checkOwner();
  return check.ok && check.degraded;
}
