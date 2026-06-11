-- Hilman. — schema
-- Run via Supabase SQL editor or `supabase db push`.

create extension if not exists "pgcrypto";

-- ── enums ────────────────────────────────────────────────
create type content_status as enum ('draft', 'published');
create type stream_kind as enum ('visual-design', 'visual-stories', 'digital-lab');
create type owner_kind as enum ('project', 'journal', 'page');
create type media_kind as enum ('image', 'file');

-- ── profiles (owner metadata, optional) ──────────────────
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- ── settings (key/value jsonb) ───────────────────────────
create table settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── taxonomy ─────────────────────────────────────────────
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  stream stream_kind,
  description text,
  sort_order int not null default 0
);

create table tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

-- ── projects ─────────────────────────────────────────────
create table projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  excerpt text,
  stream stream_kind not null default 'visual-design',
  thumbnail_public_id text,
  cover_public_id text,
  year int,
  status content_status not null default 'draft',
  featured boolean not null default false,
  sort_order int not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- ── journal ──────────────────────────────────────────────
create table journal_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  excerpt text,
  cover_public_id text,
  status content_status not null default 'draft',
  featured boolean not null default false,
  reading_minutes int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- ── pages (editable static pages) ────────────────────────
create table pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── content blocks (polymorphic) ─────────────────────────
create table content_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_type owner_kind not null,
  owner_id uuid not null,
  type text not null,
  position int not null default 0,
  data jsonb not null default '{}'::jsonb
);

-- ── joins ────────────────────────────────────────────────
create table project_tags (
  project_id uuid not null references projects (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (project_id, tag_id)
);

create table journal_tags (
  journal_id uuid not null references journal_posts (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (journal_id, tag_id)
);

-- ── media library ────────────────────────────────────────
create table media (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  kind media_kind not null default 'image',
  format text,
  width int,
  height int,
  bytes bigint,
  folder text,
  alt text,
  title text,
  created_at timestamptz not null default now()
);

-- ── messages (Connect form) ──────────────────────────────
create table messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ── indexes ──────────────────────────────────────────────
create index projects_status_idx on projects (status);
create index projects_stream_idx on projects (stream);
create index projects_featured_idx on projects (featured) where featured;
create index projects_sort_idx on projects (sort_order);
create index journal_status_idx on journal_posts (status);
create index journal_published_idx on journal_posts (published_at desc);
create index journal_featured_idx on journal_posts (featured) where featured;
create index blocks_owner_idx on content_blocks (owner_type, owner_id, position);
create index media_folder_idx on media (folder);
create index messages_created_idx on messages (created_at desc);

-- ── updated_at trigger ───────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger projects_touch before update on projects
  for each row execute function set_updated_at();
create trigger journal_touch before update on journal_posts
  for each row execute function set_updated_at();
create trigger pages_touch before update on pages
  for each row execute function set_updated_at();
create trigger settings_touch before update on settings
  for each row execute function set_updated_at();
