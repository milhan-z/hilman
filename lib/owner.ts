import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";
import { decideOwnerAccess, type OwnerCheck } from "./owner-policy";

export type { OwnerCheck } from "./owner-policy";

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
 */

export async function checkOwner(): Promise<OwnerCheck> {
  if (!supabaseConfigured) {
    return {
      ok: false,
      reason: "unconfigured",
      message: "Supabase isn't configured, so there's nothing to sign in to.",
    };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return decideOwnerAccess(null, null, null);
  }

  const { data, error } = await supabase.rpc("is_site_owner");

  if (error) {
    console.error("[owner] ownership check failed:", error.message);
  }

  return decideOwnerAccess(user.id, data, error);
}

/** True when the ownership rule is only being enforced by the app, not the database. */
export async function ownerEnforcementDegraded(): Promise<boolean> {
  const check = await checkOwner();
  return check.ok && check.degraded;
}
