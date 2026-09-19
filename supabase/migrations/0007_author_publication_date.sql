-- Hilman. — let the author choose a publication date
--
-- `published_at` has always been the database's to decide: set to now() the
-- first time something is published, preserved for ever after. That is the
-- right default and the wrong only option. A piece written last month, a date
-- corrected after the fact, an entry backdated to when the thing actually
-- happened — none of those are "now", and until this migration the Studio had
-- no way to say so, because save_project()/save_journal_post() never read
-- `published_at` out of the payload at all.
--
-- So: when the payload carries a `published_at`, it wins. When it does not —
-- which is every save the editor makes with the field left empty — the old
-- behaviour is untouched, including "stamp it on first publish" and "never
-- move it afterwards".
--
-- Deliberately *absent* rather than null to mean "I did not touch this".
-- `p_data ->> 'published_at'` returning NULL covers both "key missing" and
-- "key is JSON null", and neither is allowed to clear a date that exists:
-- clearing is a destructive instruction and should not be the accidental
-- result of an empty form field.
--
-- Schema is unchanged. The column already exists; only who may fill it moves.

create or replace function public.save_project(
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
  v_id          uuid;
  v_title       text := nullif(btrim(p_data ->> 'title'), '');
  v_slug        text := nullif(btrim(p_data ->> 'slug'), '');
  v_status      content_status := coalesce((p_data ->> 'status')::content_status, 'draft');
  v_published   timestamptz;
  -- The date the author picked, if they picked one. NULL when the key
  -- is absent or JSON null, which both mean "leave this alone".
  v_chosen      timestamptz := nullif(btrim(p_data ->> 'published_at'), '')::timestamptz;
  v_bad_block   int;
begin
  if not public.is_site_owner() then
    raise exception 'Not authorized to edit this site.' using errcode = '42501';
  end if;
  if v_title is null then
    raise exception 'A project needs a title.' using errcode = '23514';
  end if;
  if v_slug is null then
    raise exception 'A project needs a slug.' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_blocks, '[]'::jsonb)) <> 'array' then
    raise exception 'Blocks payload is not a list.' using errcode = '22023';
  end if;

  -- Reject the whole payload before touching anything.
  -- jsonb_exists() rather than the ? operator: the Supabase SQL editor reads a
  -- bare ? as a bind parameter and fails to parse the statement.
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
    insert into projects (
      slug, title, subtitle, excerpt, stream, year, status, featured,
      sort_order, thumbnail_public_id, cover_public_id, meta, published_at
    ) values (
      v_slug,
      v_title,
      nullif(btrim(p_data ->> 'subtitle'), ''),
      nullif(btrim(p_data ->> 'excerpt'), ''),
      coalesce((p_data ->> 'stream')::stream_kind, 'visual-design'),
      nullif(p_data ->> 'year', '')::int,
      v_status,
      coalesce((p_data ->> 'featured')::boolean, false),
      coalesce(nullif(p_data ->> 'sort_order', '')::int, 0),
      nullif(btrim(p_data ->> 'thumbnail_public_id'), ''),
      nullif(btrim(p_data ->> 'cover_public_id'), ''),
      coalesce(p_data -> 'meta', '{}'::jsonb),
      v_published
    )
    returning id into v_id;
  else
    select published_at into v_published from projects where id = p_id;
    if not found then
      raise exception 'That project no longer exists.' using errcode = 'P0002';
    end if;
    if v_status = 'published' and v_published is null then
      v_published := now();
    end if;
    -- Re-dating an already published entry is the whole point, so this
    -- overrides the stored value rather than only filling a gap.
    v_published := coalesce(v_chosen, v_published);

    update projects set
      slug                = v_slug,
      title               = v_title,
      subtitle            = nullif(btrim(p_data ->> 'subtitle'), ''),
      excerpt             = nullif(btrim(p_data ->> 'excerpt'), ''),
      stream              = coalesce((p_data ->> 'stream')::stream_kind, stream),
      year                = nullif(p_data ->> 'year', '')::int,
      status              = v_status,
      featured            = coalesce((p_data ->> 'featured')::boolean, false),
      sort_order          = coalesce(nullif(p_data ->> 'sort_order', '')::int, 0),
      thumbnail_public_id = nullif(btrim(p_data ->> 'thumbnail_public_id'), ''),
      cover_public_id     = nullif(btrim(p_data ->> 'cover_public_id'), ''),
      meta                = coalesce(p_data -> 'meta', '{}'::jsonb),
      published_at        = v_published
    where id = p_id
    returning id into v_id;
  end if;

  delete from content_blocks where owner_type = 'project' and owner_id = v_id;
  insert into content_blocks (owner_type, owner_id, type, position, data)
  select 'project', v_id, btrim(b ->> 'type'), (ord - 1)::int,
         coalesce(b -> 'data', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_blocks, '[]'::jsonb)) with ordinality as t(b, ord);

  delete from project_tags where project_id = v_id;
  if array_length(p_tag_ids, 1) is not null then
    insert into project_tags (project_id, tag_id)
    select v_id, t from unnest(p_tag_ids) t
    on conflict do nothing;
  end if;

  return v_id;
end $fn$;

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

/* ── the grants from 0005 still apply ─────────────────────── */
--
-- `create or replace` keeps existing privileges, so the revokes in
-- 0005_function_hardening.sql are not undone by this file. Re-stated here so
-- that is a decision on the record rather than an assumption.
revoke all on function public.save_project(uuid, jsonb, jsonb, uuid[]) from anon;
revoke all on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) from anon;
