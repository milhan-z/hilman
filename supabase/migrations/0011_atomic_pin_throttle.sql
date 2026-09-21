-- Hilman. - count a PIN attempt in one step, not three
--
-- The Studio PIN guards a real Supabase sign-in, so the count of wrong
-- guesses is security-sensitive. It was kept like this:
--
--     read the counts        (select ... where key in (...))
--     decide in JavaScript   (checkPinBuckets)
--     write them back        (upsert)
--
-- Three steps, two round trips, nothing holding anything in between. Two
-- attempts arriving together both read N, both decide N+1, and both write
-- N+1 — so two guesses cost one. Enough concurrency and the limit of five
-- never arrives, which is the whole of the protection for a six-digit secret.
--
-- -- what this adds --
--
-- One function that does all three atomically. It takes the row for each
-- bucket with `for update` before reading it, so a second caller waits and
-- then reads the first one's result rather than the same stale number.
--
-- It also *reserves* rather than reports: the attempt is counted before the
-- PIN is compared, and a correct PIN clears the counters afterwards. Counting
-- first is what makes it atomic at all — the alternative is holding a
-- database lock across the comparison, which is worse in every way.
--
-- Buckets are taken in sorted order so two callers naming the same pair (an
-- address and the global door) can never take them in opposite orders and
-- deadlock.
--
-- Nothing here decides whether a PIN is right; that stays in the application,
-- and the secret never reaches the database.
--
-- Forward-only. Safe on a database that already has 0001-0010 applied, and
-- safe to run twice.

/* == one attempt, counted once ============================= */

-- p_buckets: [{ "key": "ip:…", "max": 5, "lockoutSeconds": 900 }, …]
--
-- Returns:
--   { "allowed": true,  "remaining": 3 }
--   { "allowed": false, "lockedUntil": "2026-…" }
create or replace function public.studio_pin_attempt(p_buckets jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_now      timestamptz := now();
  v_bucket   jsonb;
  v_key      text;
  v_max      int;
  v_lockout  interval;
  v_failures int;
  v_locked   timestamptz;
  v_blocked  timestamptz := null;
  v_remaining int := 2147483647;
begin
  if jsonb_typeof(p_buckets) <> 'array' or jsonb_array_length(p_buckets) = 0 then
    raise exception 'A PIN attempt needs at least one bucket.' using errcode = '22023';
  end if;

  -- Sorted by key: two callers naming the same pair take them in the same
  -- order and therefore cannot wait on each other in a cycle.
  for v_bucket in
    select value from jsonb_array_elements(p_buckets) order by value ->> 'key'
  loop
    v_key := v_bucket ->> 'key';
    if v_key is null or btrim(v_key) = '' then
      raise exception 'A PIN bucket needs a key.' using errcode = '22023';
    end if;
    v_max := greatest(1, coalesce((v_bucket ->> 'max')::int, 5));
    v_lockout := make_interval(secs => greatest(1, coalesce((v_bucket ->> 'lockoutSeconds')::int, 900)));

    -- Make sure there is a row to lock, then lock it. `for update` is what
    -- turns read-decide-write into one step: the second caller blocks here
    -- and reads what the first one wrote, instead of the same stale count.
    insert into studio_pin_attempts (key, failures, updated_at)
    values (v_key, 0, v_now)
    on conflict (key) do nothing;

    select failures, locked_until
      into v_failures, v_locked
      from studio_pin_attempts
     where key = v_key
       for update;

    if v_locked is not null and v_locked > v_now then
      -- Already shut. Nothing is counted: a guess that was never compared is
      -- not a guess, and counting it would let an attacker extend their own
      -- lockout indefinitely against the owner.
      if v_blocked is null or v_locked > v_blocked then v_blocked := v_locked; end if;
      continue;
    end if;

    -- A lockout that has run out starts the window again rather than
    -- resuming where it left off.
    if v_locked is not null then v_failures := 0; end if;

    v_failures := v_failures + 1;

    if v_failures >= v_max then
      update studio_pin_attempts
         set failures = 0, locked_until = v_now + v_lockout, updated_at = v_now
       where key = v_key;
      if v_blocked is null or v_now + v_lockout > v_blocked then
        v_blocked := v_now + v_lockout;
      end if;
    else
      update studio_pin_attempts
         set failures = v_failures, locked_until = null, updated_at = v_now
       where key = v_key;
      v_remaining := least(v_remaining, v_max - v_failures);
    end if;
  end loop;

  if v_blocked is not null then
    return jsonb_build_object('allowed', false, 'lockedUntil', to_jsonb(v_blocked));
  end if;
  return jsonb_build_object('allowed', true, 'remaining', v_remaining);
end $fn$;

/* == a correct PIN forgets the wrong ones ================== */

create or replace function public.studio_pin_clear(p_keys text[])
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_keys is null or array_length(p_keys, 1) is null then return; end if;
  update studio_pin_attempts
     set failures = 0, locked_until = null, updated_at = now()
   where key = any (p_keys);
end $fn$;

/* == neither is an API ===================================== */

-- Only the service-role key may count PIN attempts: a limiter the guesser can
-- reset is not a limiter. service_role bypasses RLS and does not consult
-- EXECUTE, so revoking from everyone else closes the RPC surface without
-- closing the one caller that needs it.
revoke all on function public.studio_pin_attempt(jsonb) from public, anon, authenticated;
revoke all on function public.studio_pin_clear(text[]) from public, anon, authenticated;

notify pgrst, 'reload schema';
