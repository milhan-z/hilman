-- Hilman. — atomic content saves and media reference lookup
--
-- Saving used to be several round-trips from the app: delete the old blocks,
-- insert the new ones, delete the tags, insert the tags. A failure after the
-- first step left a published project with its body wiped. Each function
-- below is one statement from the client's point of view, so Postgres wraps
-- it in a single transaction: either the whole save lands, or the previous
-- version stays exactly as it was.
--
-- SECURITY INVOKER on purpose: RLS still applies inside the function, and the
-- explicit is_site_owner() check gives a clear error instead of "0 rows".

/* ══ projects ══════════════════════════════════════════════ */

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

/* ══ journal ═══════════════════════════════════════════════ */

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

/* ══ pages ═════════════════════════════════════════════════ */

-- Adds the core pages if they are missing and never touches an existing row.
-- This replaces "run npm run seed", which wipes all content first.
create or replace function public.ensure_core_pages()
returns setof pages
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  if not public.is_site_owner() then
    raise exception 'Not authorized to edit this site.' using errcode = '42501';
  end if;

  insert into pages (slug, title, data)
  values
    ('home',    'Home',    '{}'::jsonb),
    ('about',   'About',   '{}'::jsonb),
    ('connect', 'Connect', '{}'::jsonb)
  on conflict (slug) do nothing;

  return query select * from pages order by slug;
end $fn$;

/* ══ media reference lookup ════════════════════════════════ */

-- "Is this image still used anywhere?" — checked before a delete so an asset
-- that a published page depends on cannot vanish by accident.
create or replace function public.media_references(p_public_id text)
returns table (kind text, ref_id uuid, label text)
language sql
stable
security invoker
set search_path = public
as $fn$
  select 'project'::text, p.id, p.title
    from projects p
   where p.thumbnail_public_id = p_public_id
      or p.cover_public_id = p_public_id
  union all
  select 'journal'::text, j.id, j.title
    from journal_posts j
   where j.cover_public_id = p_public_id
  union all
  select 'page'::text, pg.id, pg.title
    from pages pg
   where pg.data::text like '%' || p_public_id || '%'
  union all
  select ('block:' || b.owner_type::text)::text, b.owner_id, b.type
    from content_blocks b
   where b.data::text like '%' || p_public_id || '%';
$fn$;
