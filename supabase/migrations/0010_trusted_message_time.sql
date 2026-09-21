-- Hilman. - the contact form's limit, enforced against a clock we own
--
-- Two ways past the spam limit on `messages`, both reproduced against a real
-- PostgreSQL with the anon role and the real RLS policies.
--
-- -- 1. the sender chose the timestamp --
--
-- `created_at` is `not null default now()`, and a default is an offer, not a
-- rule. The insert policy never mentioned the column, so an anonymous caller
-- holding the public anon key could simply supply one:
--
--     insert into messages (name, email, body, created_at)
--     values ('A', 'spam@example.test', 'hello', now() - interval '2 hours');
--
-- The limiter counts rows `where created_at > now() - interval '1 hour'`, so
-- rows stamped two hours ago never count. Backdate every insert and the
-- window is permanently empty. Measured: 50 accepted from one address against
-- a limit of 3, and 80 from distinct addresses against a global limit of 30 —
-- 133 rows in an hour that allows 30.
--
-- -- 2. counting and inserting were not one step --
--
-- The trigger counts, then the row is written. Two transactions cannot see
-- each other's uncommitted rows, so concurrent inserts all count the same
-- world and all decide they are within the limit. Measured: ten simultaneous
-- inserts from one address, limit 3, ten stored.
--
-- -- the fix --
--
-- The trigger now sets `created_at` itself, before it counts, so what the
-- caller asked for is irrelevant and the stored value and the counted value
-- are the same thing. And it takes one transaction-scoped advisory lock, so
-- the count and the insert it authorises cannot interleave with another.
--
-- A single global lock rather than one per sender: a contact form that allows
-- thirty messages an hour has no throughput to protect, and one lock cannot
-- deadlock against itself the way an unordered pair can.
--
-- No new columns and no new tracking. This is about enforcing the limit that
-- was always intended, not about learning more about who is writing.
--
-- Forward-only. Safe to run on a database that already has 0001-0009 applied,
-- and safe to run twice.

create or replace function public.messages_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  per_sender int;
  per_hour   int;
begin
  -- The clock is ours. An anonymous caller may propose a `created_at` -- the
  -- column has a default and the insert policy says nothing about it -- and
  -- proposing one two hours ago is how the window below was emptied. Setting
  -- it here, before anything is counted, means the value that is stored and
  -- the value that is counted are the same value, and neither came from the
  -- caller.
  new.created_at := now();

  -- Count and insert, without another insert slipping between them.
  --
  -- The counts below read committed rows only, so two concurrent inserts each
  -- saw a world without the other and each concluded it was within the limit.
  -- Ten at once went in against a limit of three. The lock is released when
  -- this transaction ends, whether it commits or not.
  perform pg_advisory_xact_lock(hashtextextended('public.messages_rate_limit', 0));

  select count(*) into per_sender
  from messages
  where lower(email) = lower(new.email)
    and created_at > now() - interval '1 hour';
  if per_sender >= 3 then
    raise exception 'Too many messages from this address — try again later.'
      using errcode = '53400';
  end if;

  select count(*) into per_hour
  from messages
  where created_at > now() - interval '1 hour';
  if per_hour >= 30 then
    raise exception 'The inbox is rate limited right now — try again later.'
      using errcode = '53400';
  end if;

  return new;
end $fn$;

-- The trigger is re-pointed at the replaced function for the avoidance of
-- doubt; `create or replace` alone would have been enough.
drop trigger if exists messages_rate_limit_trg on messages;
create trigger messages_rate_limit_trg before insert on messages
  for each row execute function public.messages_rate_limit();

/* == the function is still not an API ====================== */

-- As in 0005: it only makes sense as a BEFORE INSERT trigger, and triggers do
-- not check EXECUTE, so revoking costs nothing and closes the RPC surface.
revoke all on function public.messages_rate_limit() from public, anon, authenticated;

notify pgrst, 'reload schema';
