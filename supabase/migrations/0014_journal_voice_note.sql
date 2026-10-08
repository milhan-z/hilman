-- Hilman. - a journal entry, read aloud
--
-- Some Journal entries carry a recording of the author reading them. It is a
-- property of the entry, not a content block: there is one per entry, and it
-- always sits in the header, before the writing it reads.
--
-- ── the column ──
--
-- `voice_note jsonb`, null when the entry is text only. One concept -- where
-- the recording is, what it is, how long, how big -- so one column, the same
-- way `meta` holds a project's structured details.
--
--   { "src": "voice-notes/<uuid>.m4a" | "voice-notes/<uuid>.mp3",
--     "mime_type": "audio/mp4" | "audio/mpeg",
--     "duration_seconds": number > 0 and <= 7200, or null,
--     "bytes": integer > 0 and <= 25 MB, optional }
--
-- `src` is an R2 key, not a URL; the public address is resolved when a page
-- is rendered. lib/voice-note.ts is the same rule in TypeScript and the two
-- must change together.
--
-- The CHECK is the last line of the rule that a `pending:<uuid>` -- a
-- recording that exists only on the author's phone -- never reaches the
-- database. The editor holds such a save back and the sync route refuses it;
-- this refuses it even from a direct call to the function.
--
-- ── the save function ──
--
-- save_journal_post is restated from 0012 with exactly one change: it reads
-- `voice_note`, and an absent key keeps the stored value (see the comment at
-- the UPDATE). Everything else -- owner check, block validation, publication
-- date, tags, the vanished-row guard -- is 0012's, word for word.
-- save_content_synced is untouched: it hands p_data through whole and its
-- digest already covers every key in it.
--
-- Safe to run more than once.

alter table public.journal_posts add column if not exists voice_note jsonb;

alter table public.journal_posts drop constraint if exists journal_voice_note_shape;
alter table public.journal_posts add constraint journal_voice_note_shape check (
  voice_note is null
  or (
    jsonb_typeof(voice_note) = 'object'
    -- nothing but the four known keys
    and (voice_note - array['src', 'mime_type', 'duration_seconds', 'bytes']) = '{}'::jsonb
    and coalesce(voice_note ->> 'src', '') ~
          '^voice-notes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(m4a|mp3)$'
    -- the container named by the extension and by the type have to agree.
    -- coalesce: a missing mime_type makes both comparisons NULL, and a CHECK
    -- that comes out NULL passes.
    and coalesce(
         (voice_note ->> 'mime_type' = 'audio/mp4'  and voice_note ->> 'src' like '%.m4a')
      or (voice_note ->> 'mime_type' = 'audio/mpeg' and voice_note ->> 'src' like '%.mp3'),
      false
    )
    -- CASE, not OR: it is the one construct whose evaluation order SQL
    -- guarantees, so a non-number is refused as a CHECK failure rather than
    -- reaching the ::numeric cast and raising a different error.
    and case coalesce(jsonb_typeof(voice_note -> 'duration_seconds'), 'null')
          when 'null'   then true
          when 'number' then (voice_note ->> 'duration_seconds')::numeric > 0
                         and (voice_note ->> 'duration_seconds')::numeric <= 7200
          else false
        end
    and case coalesce(jsonb_typeof(voice_note -> 'bytes'), 'null')
          when 'null'   then true
          when 'number' then (voice_note ->> 'bytes')::numeric > 0
                         and (voice_note ->> 'bytes')::numeric <= 26214400
                         and (voice_note ->> 'bytes')::numeric = trunc((voice_note ->> 'bytes')::numeric)
          else false
        end
  )
);

comment on column public.journal_posts.voice_note is
  'The author reading this entry aloud: {src (R2 key), mime_type, duration_seconds, bytes?}, or null. See lib/voice-note.ts.';

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
      reading_minutes, published_at, voice_note
    ) values (
      v_slug,
      v_title,
      nullif(btrim(p_data ->> 'excerpt'), ''),
      nullif(btrim(p_data ->> 'cover_public_id'), ''),
      v_status,
      coalesce((p_data ->> 'featured')::boolean, false),
      greatest(1, coalesce(nullif(p_data ->> 'reading_minutes', '')::int, 1)),
      v_published,
      -- Absent and null both mean none. Anything else is stored as sent and
      -- judged by the CHECK on the column, the same as on UPDATE below.
      case when coalesce(jsonb_typeof(p_data -> 'voice_note'), 'null') = 'null' then null
           else p_data -> 'voice_note' end
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
      published_at    = v_published,
      -- Absent means keep. Saves composed before this column existed -- still
      -- queued on a phone, or sent by a tab that has not reloaded -- carry no
      -- key, and must not erase a recording. Only an explicit JSON null, which
      -- the editor sends when the author presses Remove, clears it.
      voice_note      = case
                          when not jsonb_exists(p_data, 'voice_note') then voice_note
                          when jsonb_typeof(p_data -> 'voice_note') = 'null' then null
                          else p_data -> 'voice_note'
                        end
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
-- database ends where a fresh install does. See 0005, 0006, 0008, 0012.
revoke all on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) from anon;
grant execute on function public.save_journal_post(uuid, jsonb, jsonb, uuid[]) to authenticated;

notify pgrst, 'reload schema';
