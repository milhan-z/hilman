-- Hilman. — owner identity, message lifecycle, spam guard
--
-- Fixes what migration 0002 left open: "authenticated" was treated as
-- "owner", so any account that ever gets created could read drafts and
-- rewrite the site. Ownership is now an explicit membership list that the
-- app itself cannot edit.
--
-- Safe to run on a database that already has 0001 + 0002 applied.

/* ══ 1. Owner identity ═════════════════════════════════════ */

create table if not exists site_owners (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  note     text,
  added_at timestamptz not null default now()
);

-- RLS on, and deliberately *no* policies: neither anon nor authenticated can
-- read or write this table through the API. Only the SQL editor / service role
-- (which bypass RLS) decide who owns the site.
alter table site_owners enable row level security;

-- Bootstrap: whoever already has an account at migration time is the owner.
-- On a fresh project this inserts nothing — add yourself with `npm run owner`.
insert into site_owners (user_id, note)
select id, 'bootstrapped by migration 0003' from auth.users
on conflict (user_id) do nothing;

create or replace function public.is_site_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.site_owners o where o.user_id = auth.uid()
  );
$fn$;

revoke execute on function public.is_site_owner() from public, anon;
grant execute on function public.is_site_owner() to authenticated;

/* ══ 2. Re-issue owner policies against real ownership ═════ */

drop policy if exists "owner all profiles"     on profiles;
drop policy if exists "owner all settings"     on settings;
drop policy if exists "owner all categories"   on categories;
drop policy if exists "owner all tags"         on tags;
drop policy if exists "owner all projects"     on projects;
drop policy if exists "owner all journal"      on journal_posts;
drop policy if exists "owner all pages"        on pages;
drop policy if exists "owner all blocks"       on content_blocks;
drop policy if exists "owner all project_tags" on project_tags;
drop policy if exists "owner all journal_tags" on journal_tags;
drop policy if exists "owner all media"        on media;
drop policy if exists "owner read messages"    on messages;
drop policy if exists "owner delete messages"  on messages;

create policy "owner all profiles"     on profiles       for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all settings"     on settings       for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all categories"   on categories     for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all tags"         on tags           for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all projects"     on projects       for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all journal"      on journal_posts  for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all pages"        on pages          for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all blocks"       on content_blocks for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all project_tags" on project_tags   for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all journal_tags" on journal_tags   for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner all media"        on media          for all to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner read messages"    on messages       for select to authenticated
  using (public.is_site_owner());
create policy "owner update messages"  on messages       for update to authenticated
  using (public.is_site_owner()) with check (public.is_site_owner());
create policy "owner delete messages"  on messages       for delete to authenticated
  using (public.is_site_owner());

-- A signed-in non-owner is not a visitor either: it holds the `authenticated`
-- role, so the anon SELECT policies never apply to it. Give it exactly the
-- published-only read access the public gets, and nothing more.
drop policy if exists "signed-in read settings"   on settings;
drop policy if exists "signed-in read categories" on categories;
drop policy if exists "signed-in read tags"       on tags;
drop policy if exists "signed-in read pages"      on pages;
drop policy if exists "signed-in read projects"   on projects;
drop policy if exists "signed-in read journal"    on journal_posts;
drop policy if exists "signed-in read blocks"     on content_blocks;

create policy "signed-in read settings"   on settings   for select to authenticated using (true);
create policy "signed-in read categories" on categories for select to authenticated using (true);
create policy "signed-in read tags"       on tags       for select to authenticated using (true);
create policy "signed-in read pages"      on pages      for select to authenticated using (true);
create policy "signed-in read projects"   on projects   for select to authenticated
  using (status = 'published' or public.is_site_owner());
create policy "signed-in read journal"    on journal_posts for select to authenticated
  using (status = 'published' or public.is_site_owner());
create policy "signed-in read blocks"     on content_blocks for select to authenticated
  using (
    public.is_site_owner()
    or owner_type = 'page'
    or (owner_type = 'project' and exists (
      select 1 from projects p where p.id = owner_id and p.status = 'published'))
    or (owner_type = 'journal' and exists (
      select 1 from journal_posts j where j.id = owner_id and j.status = 'published'))
  );

/* ══ 3. Message lifecycle ══════════════════════════════════ */

do $mig$ begin
  create type message_status as enum ('new', 'read', 'actioned', 'archived');
exception when duplicate_object then null; end $mig$;

alter table messages add column if not exists status message_status not null default 'new';
alter table messages add column if not exists handled_at timestamptz;
create index if not exists messages_status_idx on messages (status, created_at desc);

/* ══ 4. Spam guard on the write path itself ════════════════ */
-- Rate limiting in the form component protects nothing: the anon INSERT
-- policy is reachable directly with the public anon key.

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

drop trigger if exists messages_rate_limit_trg on messages;
create trigger messages_rate_limit_trg before insert on messages
  for each row execute function public.messages_rate_limit();

drop policy if exists "public insert messages" on messages;
create policy "public insert messages" on messages
  for insert to anon
  with check (
    length(trim(name))  > 0 and length(name)  <= 120 and
    length(trim(email)) > 0 and length(email) <= 200 and
    length(trim(body))  > 0 and length(body)  <= 5000 and
    email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and
    status = 'new' and handled_at is null
  );
