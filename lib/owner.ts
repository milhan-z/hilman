import { cache } from "react";
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

/* ── the same questions, asked once per render ─────────────
 *
 * A Studio screen is a layout and a page, and both wanted to know who is
 * signed in and whether they own the site. Each asked Supabase for itself:
 * the layout's getUser(), then checkOwner()'s own getUser() and RPC, then the
 * home screen's checkOwner() again — five round trips, most of them in a row,
 * before anything past the loading skeleton could be drawn.
 *
 * React's cache() scopes an answer to one server render, so these share it.
 * They are for Server Components only. Server actions and route handlers keep
 * calling checkOwner() itself: an action can change who is signed in, and
 * must never be handed a verdict from before it did.
 */

/** The signed-in Supabase user for this render, or null. */
export const getSessionUser = cache(async () => {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** checkOwner() for layouts and pages: one ownership check per render. */
export const checkOwnerForRender = cache(async (): Promise<OwnerCheck> => {
  if (!supabaseConfigured) return checkOwner();
  const user = await getSessionUser();
  if (!user) return decideOwnerAccess(null, null, null);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.rpc("is_site_owner");
  if (error) {
    console.error("[owner] ownership check failed:", error.message);
  }
  return decideOwnerAccess(user.id, data, error);
});
