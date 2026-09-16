-- Hilman. — offline sync ledger, optimistic concurrency, durable PIN lockout
--
-- Three things a phone needs that a desktop never did:
--
--  1. A save queued on a train can be sent twice — once when the request
--     times out, once when the browser retries. `studio_mutations` remembers
--     which mutation ids already landed, so the second attempt reports the
--     first attempt's result instead of writing again.
--
--  2. A save composed offline was composed against an older version of the
--     row. save_content_synced() refuses to overwrite a row that changed in
--     the meantime and hands the caller the server's timestamp instead, so
--     the editor can show both versions rather than silently losing one.
--
--  3. PIN lockout lived in a module-level variable. On Vercel every function
--     instance had its own copy and a cold start reset it, so "five tries"
--     was really "five tries per warm instance". `studio_pin_attempts` makes
--     the count survive that.
--
-- Safe to run on a database that already has 0001–0005 applied.

/* ══ 1. Idempotency ledger ═════════════════════════════════ */

create table if not exists studio_mutations (
  mutation_id       uuid primary key,
  owner_id          uuid not null references auth.users (id) on delete cascade,
  entity            text not null check (entity in ('project', 'journal')),
  entity_id         uuid not null,
  result_updated_at timestamptz not null,
  applied_at        timestamptz not null default now()
);

create index if not exists studio_mutations_applied_at_idx
  on studio_mutations (applied_at);

alter table studio_mutations enable row level security;

drop policy if exists "owner all studio_mutations" on studio_mutations;
create policy "owner all studio_mutations" on studio_mutations for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());

/* ══ 2. PIN attempts ═══════════════════════════════════════ */

-- Written by the server with the service-role key, before anyone is signed
-- in. RLS is on with no policies at all: anon and authenticated cannot read
-- or write it through the API, which is the point — it is a rate limiter, and
-- a rate limiter an attacker can clear is not one.
create table if not exists studio_pin_attempts (
  key          text primary key,
  failures     int not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table studio_pin_attempts enable row level security;

/* ══ 3. Save with a version guard ══════════════════════════ */

-- Wraps the existing atomic saves from 0004. Those still do the real work —
-- metadata, blocks and tags in one transaction — this only decides whether
-- the save is allowed to happen and records that it did.
--
-- Returns, rather than raises, on a conflict: a conflict is an ordinary
-- outcome the editor has to render, not an error the client has to parse out
-- of a message string.
create or replace function public.save_content_synced(
  p_mutation_id     uuid,
  p_entity          text,
  p_id              uuid,
  p_base_updated_at timestamptz,
  p_data            jsonb,
  p_blocks          jsonb default '[]'::jsonb,
  p_tag_ids         uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_prev    record;
  v_id      uuid;
  v_current timestamptz;
  v_updated timestamptz;
begin
  if not public.is_site_owner() then
    raise exception 'Not authorized to edit this site.' using errcode = '42501';
  end if;
  if p_entity not in ('project', 'journal') then
    raise exception 'Unknown content kind "%".', p_entity using errcode = '22023';
  end if;
  if p_mutation_id is null then
    raise exception 'A queued save needs a mutation id.' using errcode = '22023';
  end if;

  -- Replay: the same mutation id gets the same answer and writes nothing.
  select entity, entity_id, result_updated_at
    into v_prev
    from studio_mutations
   where mutation_id = p_mutation_id;

  if found then
    if v_prev.entity <> p_entity then
      raise exception 'That mutation id already saved a different kind of content.'
        using errcode = '22023';
    end if;
    return jsonb_build_object(
      'status', 'saved',
      'replayed', true,
      'id', v_prev.entity_id,
      'updated_at', to_jsonb(v_prev.result_updated_at)
    );
  end if;

  -- Optimistic concurrency. Only edits can conflict; a create has no base.
  if p_id is not null then
    if p_entity = 'project' then
      select updated_at into v_current from projects where id = p_id;
    else
      select updated_at into v_current from journal_posts where id = p_id;
    end if;

    if not found then
      raise exception 'That % no longer exists.', p_entity using errcode = 'P0002';
    end if;

    -- A missing base is treated as a conflict on purpose: a client that does
    -- not say which version it edited cannot promise it saw the latest one.
    if p_base_updated_at is null or v_current is distinct from p_base_updated_at then
      return jsonb_build_object(
        'status', 'conflict',
        'id', p_id,
        'server_updated_at', to_jsonb(v_current)
      );
    end if;
  end if;

  if p_entity = 'project' then
    v_id := public.save_project(p_id, p_data, p_blocks, p_tag_ids);
    select updated_at into v_updated from projects where id = v_id;
  else
    v_id := public.save_journal_post(p_id, p_data, p_blocks, p_tag_ids);
    select updated_at into v_updated from journal_posts where id = v_id;
  end if;

  insert into studio_mutations (mutation_id, owner_id, entity, entity_id, result_updated_at)
  values (p_mutation_id, auth.uid(), p_entity, v_id, v_updated)
  on conflict (mutation_id) do nothing;

  -- The ledger only exists to recognise a retry. A phone that has been in a
  -- drawer for a month has lost its outbox to browser eviction long before.
  delete from studio_mutations where applied_at < now() - interval '30 days';

  return jsonb_build_object(
    'status', 'saved',
    'replayed', false,
    'id', v_id,
    'updated_at', to_jsonb(v_updated)
  );
end $fn$;

revoke all on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  from public, anon;
grant execute on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  to authenticated;

/* ── let PostgREST see the new RPC ────────────────────────── */
notify pgrst, 'reload schema';
