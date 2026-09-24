-- Hilman. - how many people have read each entry
--
-- A running count per published project and journal entry, shown on the
-- public site next to the date and on the cards in Works and Journal.
--
-- ── why a table of its own ──
--
-- The obvious place for a counter is a column on `projects` and
-- `journal_posts`, and it is the one place it must not go. Both tables have a
-- BEFORE UPDATE trigger that stamps `updated_at` (0001), and `updated_at` is
-- the version the Studio's offline queue saves against: save_content_synced
-- refuses a save whose base no longer matches (0006, 0009). A counter on the
-- row would move that version every time somebody opened the page, and the
-- author's next save from a phone would come back as a conflict with a
-- stranger's visit. Here the counts live beside the content and never touch
-- it.
--
-- `owner_type` + `owner_id`, the same shape as `content_blocks`, and tidied up
-- the same way: when a project or entry is deleted its count goes with it.
--
-- ── who can write it ──
--
-- Visitors cannot write the table at all. The only way a count moves is
-- record_read(), which counts published content and nothing else, one read
-- per call. Deciding what is *a read* -- once per browser per day, after the
-- page has actually been on screen, never a crawler, never the author -- is
-- done before the call, in components/reader-count.tsx and app/api/reads;
-- this function only guarantees the number cannot be pointed at a draft or
-- set to anything but itself plus one.
--
-- Forward-only. Safe on a database that already has 0001-0012 applied, and
-- safe to run twice.

/* == 1. the counts ========================================= */

create table if not exists public.content_reads (
  owner_type text        not null check (owner_type in ('project', 'journal')),
  owner_id   uuid        not null,
  reads      bigint      not null default 0 check (reads >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_type, owner_id)
);

alter table public.content_reads enable row level security;

-- Readable by everyone: it is a number already printed on the public page.
drop policy if exists "public read content_reads" on public.content_reads;
create policy "public read content_reads" on public.content_reads
  for select to anon, authenticated using (true);

-- The owner may reset or remove a count, and has to be able to for the
-- cleanup trigger below to run on their behalf. Nobody else writes here.
drop policy if exists "owner all content_reads" on public.content_reads;
create policy "owner all content_reads" on public.content_reads
  for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());

/* == 2. counting one read ================================== */

-- Returns the new count, or null when there is nothing public to count: a
-- draft, a deleted entry, an id that was never there. Null rather than an
-- error, because the caller is a visitor's browser and "not counted" is the
-- whole of the answer it needs.
create or replace function public.record_read(p_kind text, p_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_reads bigint;
begin
  if p_kind = 'project' then
    perform 1 from public.projects where id = p_id and status = 'published';
  elsif p_kind = 'journal' then
    perform 1 from public.journal_posts where id = p_id and status = 'published';
  else
    raise exception 'Unknown content kind "%".', p_kind using errcode = '22023';
  end if;

  if not found then
    return null;
  end if;

  insert into public.content_reads as c (owner_type, owner_id, reads)
  values (p_kind, p_id, 1)
  on conflict (owner_type, owner_id)
  do update set reads = c.reads + 1, updated_at = now()
  returning c.reads into v_reads;

  return v_reads;
end $fn$;

-- Postgres grants EXECUTE to PUBLIC by default (see 0005); this one is meant
-- for visitors, so it is granted to them by name and to nobody else.
revoke all on function public.record_read(text, uuid) from public;
grant execute on function public.record_read(text, uuid) to anon, authenticated;

/* == 3. a count leaves with its entry ====================== */

create or replace function public.forget_content_reads()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.content_reads
   where owner_type = tg_argv[0]
     and owner_id = old.id;
  return old;
end $fn$;

-- A trigger function is not an API (see 0005).
revoke all on function public.forget_content_reads() from public, anon, authenticated;

drop trigger if exists projects_forget_reads on public.projects;
create trigger projects_forget_reads
  after delete on public.projects
  for each row execute function public.forget_content_reads('project');

drop trigger if exists journal_forget_reads on public.journal_posts;
create trigger journal_forget_reads
  after delete on public.journal_posts
  for each row execute function public.forget_content_reads('journal');

notify pgrst, 'reload schema';
