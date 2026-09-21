-- Hilman. - repair the author publication date, and close the replay hole
--
-- Two corrections, both forward-only. Migration 0007 has already been applied
-- to the live project, so it is left exactly as it was deployed rather than
-- rewritten to pretend it was always right.
--
-- -- 1. save_journal_post() could not run at all --
--
-- 0007 taught both save functions to honour a publication date the author
-- chose, through a local called `v_chosen`. In save_project() it is declared.
-- In save_journal_post() it is used three times and declared nowhere.
--
-- plpgsql does not catch that at CREATE time: the body is parsed into
-- statements, but names inside SQL expressions are resolved when the statement
-- first runs. So the migration applied cleanly and every journal save since
-- has failed at runtime with:
--
--     column "v_chosen" does not exist
--
-- Saving a project was unaffected. Saving or publishing a journal entry was
-- not possible at all.
--
-- -- 2. a replayed mutation id was never checked against its payload --
--
-- The ledger in 0006 recognises a mutation id and returns the first attempt's
-- result without writing, which is exactly right for a retry of the same save.
-- It had no way to notice a *different* save arriving under an id that had
-- already been used: it would report the earlier save's result, and the client
-- would mark the newer writing as saved.
--
-- The client is what must not do that, and no longer does - an attempted
-- mutation's payload is now frozen, see lib/studio-local/outbox.ts. This is
-- the other half of that contract, kept on the side that cannot be bypassed by
-- an old tab, a stale service worker or a bug. A replay whose payload differs
-- from the one on record is refused loudly instead of answered wrongly.
--
-- Safe to run on a database that already has 0001-0007 applied, and safe to
-- run twice.

/* == 1. The journal save, with its missing declaration ===== */

create or replace function public.save_journal_post(
  p_id      uuid,
  p_data    jsonb,
  p_blocks  jsonb default '[]'::jsonb,
  p_tag_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id        uuid;
  v_title     text := nullif(btrim(p_data ->> 'title'), '');
  v_slug      text := nullif(btrim(p_data ->> 'slug'), '');
  v_status    content_status := coalesce((p_data ->> 'status')::content_status, 'draft');
  v_published timestamptz;
  v_chosen      timestamptz := nullif(btrim(p_data ->> 'published_at'), '')::timestamptz;
  v_bad_block int;
begin
  if not public.is_site_owner() then
    raise exception 'Not authorized to edit this site.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'An entry needs a title.' using errcode = '23514';
  end if;
  if v_slug is null then
    raise exception 'An entry needs a slug.' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' then
    raise exception 'Blocks payload is not a list.' using errcode = '22023';
  end if;

  select count(*) into v_bad_block
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) b
  where nullif(btrim(b ->> 'type'), '') is null
     or (jsonb_exists(b, 'data') and jsonb_typeof(b -> 'data') <> 'object');
  if v_bad_block > 0 then
    raise exception 'Content payload has % malformed block(s).', v_bad_block
      using errcode = '22023';
  end if;

  if p_id is null then
    if v_status = 'published' then v_published := now(); end if;
    -- An explicit choice outranks the stamp, and applies even to a
    -- draft so the date survives until it is published.
    v_published := coalesce(v_chosen, v_published);
    insert into journal_posts (
      slug, title, excerpt, cover_public_id, status, featured,
      reading_minutes, published_at
    ) values (
      v_slug,
      v_title,
      nullif(btrim(p_data ->> 'excerpt'), ''),
      nullif(btrim(p_data ->> 'cover_public_id'), ''),
      v_status,
      coalesce((p_data ->> 'featured')::boolean, false),
      greatest(1, coalesce(nullif(p_data ->> 'reading_minutes', '')::int, 1)),
      v_published
    )
    returning id into v_id;
  else
    select published_at into v_published from journal_posts where id = p_id;
    if not found then
      raise exception 'That entry no longer exists.' using errcode = 'P0002';
    end if;
    if v_status = 'published' and v_published is null then
      v_published := now();
    end if;
    -- Re-dating an already published entry is the whole point, so this
    -- overrides the stored value rather than only filling a gap.
    v_published := coalesce(v_chosen, v_published);

    update journal_posts set
      slug            = v_slug,
      title           = v_title,
      excerpt         = nullif(btrim(p_data ->> 'excerpt'), ''),
      cover_public_id = nullif(btrim(p_data ->> 'cover_public_id'), ''),
      status          = v_status,
      featured        = coalesce((p_data ->> 'featured')::boolean, false),
      reading_minutes = greatest(1, coalesce(nullif(p_data ->> 'reading_minutes', '')::int, 1)),
      published_at    = v_published
    where id = p_id
    returning id into v_id;
  end if;

  delete from content_blocks where owner_type = 'journal' and owner_id = v_id;
  insert into content_blocks (owner_type, owner_id, type, position, data)
  select 'journal', v_id, btrim(b ->> 'type'), (ord - 1)::int,
         coalesce(b -> 'data', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as t(b, ord);

  delete from journal_tags where journal_id = v_id;
  if array_length(p_tag_ids, 1) is not null then
    insert into journal_tags (journal_id, tag_id)
    select v_id, t from unnest(p_tag_ids) t
    on conflict do nothing;
  end if;

  return v_id;
end $fn$;

/* == 2. A mutation id may only ever mean one payload ======= */

-- Nullable, so every mutation recorded before this migration keeps replaying
-- exactly as it did. Only ids written from here on can be checked.
alter table studio_mutations
  add column if not exists payload_digest text;

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

-- `create or replace` preserves existing privileges; these are restated so an
-- upgraded database ends in the same place as a fresh install. See 0005, 0006.
revoke all on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) to authenticated;

revoke all on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  from public, anon;
grant execute on function public.save_content_synced(uuid, text, uuid, timestamptz, jsonb, jsonb, uuid[])
  to authenticated;

/* == let PostgREST see the corrected functions ============= */
notify pgrst, 'reload schema';
