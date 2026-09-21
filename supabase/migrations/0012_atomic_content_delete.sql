-- Hilman. - deleting an article is one thing, not two
--
-- Deleting a project or a journal entry was two statements from the server
-- action, in two round trips, with nothing tying them together:
--
--     delete from content_blocks where owner_type = ... and owner_id = ...
--     delete from projects where id = ...
--
-- and neither result was looked at. If the first succeeded and the second did
-- not -- a constraint, a dropped connection, anything -- the article stayed on
-- the site with its entire body removed, and the studio reported success and
-- redirected. Reproduced against a real PostgreSQL: a published project with
-- twenty blocks, one failure, and afterwards the project is still there and
-- every block is gone.
--
-- `content_blocks` is the reason this cannot be left to the schema. Tags
-- cascade, because `project_tags` and `journal_tags` have real foreign keys.
-- Blocks are polymorphic -- `owner_type` plus `owner_id`, no constraint to
-- hang a cascade on -- so somebody has to delete them deliberately, and
-- "somebody" was two unchecked statements in application code.
--
-- One function, one transaction: either the article and its body are both
-- gone, or neither is. Authorization is inside it, so the database enforces
-- ownership rather than trusting that the caller already checked.
--
-- The two save functions are restated with one guard added, for a case the
-- delete makes reachable: a save that was already in flight when the article
-- was deleted. Its UPDATE now matches nothing, and it used to carry on with a
-- null id and fall over inserting blocks with a null owner. That aborts the
-- whole save, so nothing is corrupted -- but it is a not-null violation, and
-- the sync route reads that as a temporary problem and retries it for ever.
-- Saying 'no longer exists' instead makes it a refusal the editor can show.
--
-- Forward-only. Safe on a database that already has 0001-0011 applied, and
-- safe to run twice.

/* == 1. one delete, one transaction ======================== */

create or replace function public.delete_content(p_entity text, p_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_blocks int;
  v_title  text;
begin
  if not public.is_site_owner() then
    raise exception 'Not authorized to edit this site.' using errcode = '42501';
  end if;
  if p_entity not in ('project', 'journal') then
    raise exception 'Unknown content kind "%".', p_entity using errcode = '22023';
  end if;
  if p_id is null then
    raise exception 'Nothing was named to delete.' using errcode = '22023';
  end if;

  -- Take the row before removing anything that belongs to it. A save landing
  -- between the two deletes would otherwise reinsert blocks for a row that is
  -- about to disappear, which is how an orphan is made.
  if p_entity = 'project' then
    select title into v_title from projects where id = p_id for update;
  else
    select title into v_title from journal_posts where id = p_id for update;
  end if;

  if not found then
    raise exception 'That % no longer exists.', p_entity using errcode = 'P0002';
  end if;

  -- Polymorphic ownership: no foreign key exists to cascade from, so this is
  -- the deliberate step that keeps blocks from outliving their article.
  delete from content_blocks
   where owner_type = p_entity::owner_kind
     and owner_id = p_id;
  get diagnostics v_blocks = row_count;

  -- Tags go with the row itself: project_tags and journal_tags cascade.
  if p_entity = 'project' then
    delete from projects where id = p_id;
  else
    delete from journal_posts where id = p_id;
  end if;

  return jsonb_build_object('deleted', true, 'title', v_title, 'blocks', v_blocks);
end $fn$;

-- Mirrors 0005: anonymous visitors have no business calling this at all, and
-- the owner check above is the real gate for everyone else.
revoke all on function public.delete_content(text, uuid) from public, anon;
grant execute on function public.delete_content(text, uuid) to authenticated;

/* == 2. a save that lost its article says so ================ */

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

    -- The row was there when this function looked, and is not there now: a
    -- delete committed in between and this UPDATE matched nothing. Without
    -- this the function carried on with a null v_id and fell over inserting
    -- blocks with a null owner -- a not-null violation, which the sync route
    -- reads as a temporary problem and retries for ever against a project that is
    -- never coming back.
    if v_id is null then
      raise exception 'That project no longer exists.' using errcode = 'P0002';
    end if;
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

    -- The row was there when this function looked, and is not there now: a
    -- delete committed in between and this UPDATE matched nothing. Without
    -- this the function carried on with a null v_id and fell over inserting
    -- blocks with a null owner -- a not-null violation, which the sync route
    -- reads as a temporary problem and retries for ever against a journal entry that is
    -- never coming back.
    if v_id is null then
      raise exception 'That journal entry no longer exists.' using errcode = 'P0002';
    end if;
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

/* == grants, unchanged ===================================== */

-- `create or replace` preserves existing privileges; restated so an upgraded
-- database ends where a fresh install does. See 0005, 0006, 0008.
revoke all on function public.save_project(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.save_project(uuid, jsonb, jsonb, uuid[]) to authenticated;
revoke all on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';
