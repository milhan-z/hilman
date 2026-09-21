-- Hilman. - serialize concurrent studio saves
--
-- Two writers editing the same entry from the same version could both be told
-- "saved", and one of them was simply gone.
--
-- save_content_synced decides whether a save is allowed by reading the row's
-- `updated_at` and comparing it with the version the editor says it edited.
-- Nothing held the row between that read and the write that followed, so:
--
--     T1 reads version V        T2 reads version V
--     T1 passes the check       T2 passes the check
--     T1 writes                 T2 writes
--
-- No conflict was reported to either. The editor that lost moved its own
-- `synced` snapshot forward on the strength of that answer, so it never
-- offered the overwritten writing again -- which is the part that makes this a
-- loss rather than an inconvenience. Reproduced with two real connections in
-- tests/studio-concurrency.test.ts.
--
-- The same shape appeared one level up, around the idempotency ledger: it was
-- read with a SELECT and written at the very end, so two deliveries of one
-- mutation id could both find nothing and both do the work. The ledger then
-- recorded a version the row was no longer at, and every subsequent replay of
-- that id handed the client a base that does not exist.
--
-- Both are fixed with ordinary PostgreSQL: a transaction-scoped advisory lock
-- keyed on the mutation id, and `for update` on the row whose version is being
-- decided. No new tables, no new columns, no change to any signature, and no
-- change to what any of this returns -- only to what two of them do at once.
--
-- Forward-only. 0006 and 0008 are historical and stay as they were deployed.
-- Safe to run on a database that already has 0001-0008 applied, and safe to
-- run twice.

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
  -- What this mutation id is being asked to mean. jsonb::text normalises key
  -- order, so an identical save produces an identical digest on every retry.
  v_digest  text := md5(
    coalesce(p_data::text, '') || '|' ||
    coalesce(p_blocks::text, '') || '|' ||
    coalesce(array_to_string(p_tag_ids, ','), '')
  );
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

  -- One executor per mutation id, held until this transaction ends.
  --
  -- The replay check below is a SELECT and the ledger row is written at the
  -- very end, so two deliveries of one id could both look, both find nothing,
  -- both do the work, and only then argue about the ledger. The loser's write
  -- had already happened. Worse, the surviving ledger row then named a version
  -- the row was no longer at, and every later replay handed the client a base
  -- that does not exist -- conflicting for ever, with nothing to show why.
  --
  -- An advisory lock rather than a claim row, because a create does not know
  -- its entity_id until after the work is done, and a placeholder row that has
  -- to be corrected afterwards is a second thing that can be interrupted.
  -- Different ids hash to different keys and never wait on each other; a
  -- collision costs one duplicate a short wait and nothing else.
  perform pg_advisory_xact_lock(hashtextextended(p_mutation_id::text, 0));

  -- Replay: the same mutation id gets the same answer and writes nothing.
  select entity, entity_id, result_updated_at, payload_digest
    into v_prev
    from studio_mutations
   where mutation_id = p_mutation_id;

  if found then
    if v_prev.entity <> p_entity then
      raise exception 'That mutation id already saved a different kind of content.'
        using errcode = '22023';
    end if;
    -- A retry carries the payload it carried before. Anything else is a client
    -- that has reused an id, and answering it with the earlier save's result
    -- would report writing as saved that was never so much as looked at.
    if v_prev.payload_digest is not null and v_prev.payload_digest <> v_digest then
      raise exception 'That mutation id was already used for a different save.'
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
  --
  -- `for update` is the whole of the fix. Reading the version and writing the
  -- row were two steps with nothing holding the row in between, so two writers
  -- could both read version V, both pass this check, and both write -- each
  -- told "saved", one of them simply gone. No conflict was ever reported, and
  -- the editor that lost moved its own synced snapshot forward, so it would
  -- never offer that writing again either.
  --
  -- Taking the row lock here makes the second writer wait, and under READ
  -- COMMITTED it then re-reads the row as the first writer left it -- so the
  -- comparison below is against what is actually there, and the second writer
  -- is told it conflicted. Nothing else in the function needs to change,
  -- because every write already happens after this point.
  if p_id is not null then
    if p_entity = 'project' then
      select updated_at into v_current from projects where id = p_id for update;
    else
      select updated_at into v_current from journal_posts where id = p_id for update;
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

  insert into studio_mutations
    (mutation_id, owner_id, entity, entity_id, result_updated_at, payload_digest)
  values (p_mutation_id, auth.uid(), p_entity, v_id, v_updated, v_digest)
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

/* == grants, unchanged ===================================== */

-- `create or replace` preserves existing privileges; restated so an upgraded
-- database ends where a fresh install does. See 0005, 0006, 0008.
revoke all on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  from public, anon;
grant execute on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  to authenticated;

notify pgrst, 'reload schema';
