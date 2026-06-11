-- Hilman. — Row Level Security
-- Single-owner CMS: any *authenticated* user is the owner.
-- Disable public sign-ups in Supabase Auth settings (see README).

alter table profiles enable row level security;
alter table settings enable row level security;
alter table categories enable row level security;
alter table tags enable row level security;
alter table projects enable row level security;
alter table journal_posts enable row level security;
alter table pages enable row level security;
alter table content_blocks enable row level security;
alter table project_tags enable row level security;
alter table journal_tags enable row level security;
alter table media enable row level security;
alter table messages enable row level security;

-- ── owner: full access everywhere ────────────────────────
create policy "owner all profiles"    on profiles      for all to authenticated using (true) with check (true);
create policy "owner all settings"    on settings      for all to authenticated using (true) with check (true);
create policy "owner all categories"  on categories    for all to authenticated using (true) with check (true);
create policy "owner all tags"        on tags          for all to authenticated using (true) with check (true);
create policy "owner all projects"    on projects      for all to authenticated using (true) with check (true);
create policy "owner all journal"     on journal_posts for all to authenticated using (true) with check (true);
create policy "owner all pages"       on pages         for all to authenticated using (true) with check (true);
create policy "owner all blocks"      on content_blocks for all to authenticated using (true) with check (true);
create policy "owner all project_tags" on project_tags for all to authenticated using (true) with check (true);
create policy "owner all journal_tags" on journal_tags for all to authenticated using (true) with check (true);
create policy "owner all media"       on media         for all to authenticated using (true) with check (true);
create policy "owner read messages"   on messages      for select to authenticated using (true);
create policy "owner delete messages" on messages      for delete to authenticated using (true);

-- ── public (anon): published content only ────────────────
create policy "public read settings"   on settings   for select to anon using (true);
create policy "public read categories" on categories for select to anon using (true);
create policy "public read tags"       on tags       for select to anon using (true);
create policy "public read pages"      on pages      for select to anon using (true);
create policy "public read media"      on media      for select to anon using (true);

create policy "public read published projects" on projects
  for select to anon using (status = 'published');

create policy "public read published journal" on journal_posts
  for select to anon using (status = 'published');

-- join rows follow their parent's visibility
create policy "public read project_tags" on project_tags
  for select to anon using (
    exists (select 1 from projects p where p.id = project_id and p.status = 'published')
  );

create policy "public read journal_tags" on journal_tags
  for select to anon using (
    exists (select 1 from journal_posts j where j.id = journal_id and j.status = 'published')
  );

-- blocks follow their owner's visibility
create policy "public read blocks" on content_blocks
  for select to anon using (
    (owner_type = 'page')
    or (owner_type = 'project' and exists (
      select 1 from projects p where p.id = owner_id and p.status = 'published'))
    or (owner_type = 'journal' and exists (
      select 1 from journal_posts j where j.id = owner_id and j.status = 'published'))
  );

-- anyone may leave a message; only the owner reads them
create policy "public insert messages" on messages
  for insert to anon
  with check (
    length(trim(name)) > 0 and length(name) <= 120 and
    length(trim(email)) > 0 and length(email) <= 200 and
    length(trim(body)) > 0 and length(body) <= 5000
  );
