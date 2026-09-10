import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

/**
 * Session-aware client for Server Components and Server Actions (admin).
 *
 * Wrapped in React `cache()` so a single request reuses one client instead of
 * constructing (and re-parsing cookies for) a new one in the layout, the page,
 * and every helper it calls.
 */
export const createServerSupabase = cache(function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — middleware refreshes sessions instead.
        }
      },
    },
  });
});

/**
 * The signed-in user for this request, fetched at most once.
 *
 * `auth.getUser()` is a network round-trip to Supabase. The admin shell used to
 * make three of them per navigation (layout, checkOwner, page); now they share
 * one.
 */
export const getRequestUser = cache(async function getRequestUser() {
  const {
    data: { user },
  } = await createServerSupabase().auth.getUser();
  return user;
});
