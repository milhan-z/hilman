-- Hilman. — tighten who can call what
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and Supabase
-- exposes every function in `public` as an RPC endpoint. That means the
-- functions added in 0003/0004 were reachable at /rest/v1/rpc/... by anyone
-- holding the anon key. They all refuse to do anything useful without
-- ownership, but an endpoint that exists is an endpoint worth closing.
--
-- Raised by the Supabase database linter:
--   0011 function_search_path_mutable
--   0028 anon_security_definer_function_executable
--   0029 authenticated_security_definer_function_executable

/* ── trigger functions are not an API ─────────────────────── */

-- messages_rate_limit() only makes sense as a BEFORE INSERT trigger; calling it
-- directly errors anyway. Triggers do not check EXECUTE, so revoking is free.
revoke all on function public.messages_rate_limit() from public, anon, authenticated;

-- rls_auto_enable() is Supabase's own event trigger (`ensure_rls`). Event
-- triggers fire as their owner regardless of grants, so this only closes the
-- RPC surface.
do $mig$
begin
  execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
exception
  when undefined_function then null;  -- not present on every project
end $mig$;

-- set_updated_at() came from 0001 without a pinned search_path.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $fn$
begin
  new.updated_at = now();
  return new;
end $fn$;

revoke all on function public.set_updated_at() from public, anon, authenticated;

/* ── the CMS write path belongs to signed-in owners ───────── */

revoke all on function public.save_project(uuid, jsonb, jsonb, uuid[]) from public, anon;
revoke all on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) from public, anon;
revoke all on function public.ensure_core_pages() from public, anon;
revoke all on function public.media_references(text) from public, anon;

grant execute on function public.save_project(uuid, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.ensure_core_pages() to authenticated;
grant execute on function public.media_references(text) to authenticated;

-- is_site_owner() stays callable by `authenticated` on purpose: lib/owner.ts
-- asks it "am I the owner?" over RPC, and it only ever reports on the caller.
-- The linter flags it as a SECURITY DEFINER function reachable by signed-in
-- users; that is the intended design, not an oversight.

/* ── let PostgREST see the new RPCs ───────────────────────── */
notify pgrst, 'reload schema';
