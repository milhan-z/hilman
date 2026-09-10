# Hilman. — personal creative archive + CMS

A living creative archive for **Hilman**, working between **design · media · tech**.
Built like a designer's notebook: paper surfaces, a highlighter, an ink pen, and a
red pen — disciplined, not scrapbook.

- **Public site:** Home, Works (3 streams), project details rendered by a
  polymorphic block engine, Journal, Lab (live experiments), About, Connect.
- **CMS (`/admin`):** single-owner studio — projects & journal with a
  drag-reorder block builder, form-based page editors, media library (signed
  Cloudinary uploads), taxonomy, settings, messages inbox.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript, Server Actions |
| Styling | Tailwind CSS + CSS-variable design tokens (dark/light) |
| Animation | Framer Motion (respects `prefers-reduced-motion`) |
| DB + Auth | Supabase (Postgres, Auth, RLS) via `@supabase/ssr` |
| Media | Cloudinary (signed server-side uploads, `f_auto,q_auto` delivery) |
| Video | YouTube facade embed (iframe loads only on click) |
| Deploy | Vercel (ISR, `revalidatePath` on CMS saves) |

> **Next.js 14 is on the unsupported list.** The upgrade is planned, not done —
> see [`docs/UPGRADE-NEXT.md`](docs/UPGRADE-NEXT.md).

## Setup

### 1. Environment

```bash
cp .env.example .env.local
```

| Var | Where to get it | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | public |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server-only** | secret |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard | public |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard | secret |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard — signs uploads | secret |
| `NEXT_PUBLIC_SITE_URL` | the public origin, no trailing slash | public |

`NEXT_PUBLIC_SITE_URL` is not cosmetic: it builds `metadataBase`, `og:image`,
`twitter:image`, `robots.txt` and `sitemap.xml`. **Set it in the Vercel project,
not just locally.** If it is missing, `lib/site.ts` falls back to Vercel's own
`VERCEL_PROJECT_PRODUCTION_URL`, and the Studio dashboard shows a warning when the
running deployment is still advertising `localhost`.

### 2. Supabase

Run the migrations **in order** in the SQL editor (or `supabase db push`):

| Migration | What it does |
|---|---|
| `0001_init.sql` | tables, enums, indexes, triggers |
| `0002_rls.sql` | first RLS pass |
| `0003_owner_and_integrity.sql` | real ownership, message lifecycle, spam guard |
| `0004_atomic_saves.sql` | transactional saves, page bootstrap, media reference lookup |
| `0005_function_hardening.sql` | revokes the RPC surface Postgres grants to PUBLIC by default |

Note on `0004`: it uses `jsonb_exists(b, 'data')` rather than the `?` operator.
The Supabase SQL editor reads a bare `?` as a bind parameter and fails to parse
the statement — keep the function form.

Then create the owner account (**Authentication → Users → Add user**) and grant it
ownership:

```bash
npm run owner -- add you@example.com
npm run owner            # list current owners
```

**Ownership is not "being signed in."** Migration 0003 replaced the old policies —
which granted every `authenticated` user full read/write with `using (true)` — with
membership in a `site_owners` table. That table has RLS enabled and deliberately no
policies, so the app itself cannot read or change who owns the site; only the SQL
editor and the service-role key can. Disabling public sign-ups is still sensible,
but the CMS no longer depends on it.

Until 0003 is applied, `lib/owner.ts` detects the missing `is_site_owner()`
function, keeps you signed in, and shows a banner on the dashboard saying that
enforcement is app-side only.

### 3. Content

There is no "seed to get started" step. Open **Studio → Pages** and press
**Create missing pages** — it adds the empty `home` / `about` / `connect` rows and
touches nothing else.

`npm run seed` still exists, but it is a **destructive demo loader**: it deletes
every project, entry, page, tag, category and setting before inserting the
fictional content from `lib/mock.ts`. It now refuses to run against a database
that already holds content unless you pass `-- --force`.

Mock content is **development-only**. A production build with no Supabase
credentials used to serve `lib/mock.ts` to visitors, which put invented project
slugs into the live sitemap while the real pages 404'd. Now that case is an error.

### 4. Cloudinary (signed uploads)

No unsigned presets. The flow is:

1. The Studio client `POST`s to `/api/cloudinary/sign` — **site-owner session
   required**, not merely a signed-in one.
2. The route validates the folder name and signs `{ folder, timestamp }` with
   `CLOUDINARY_API_SECRET`.
3. The browser uploads the file directly to Cloudinary with that signature.
4. The asset is recorded in the `media` table. If that record fails, the upload is
   reported as *uploaded but not filed* rather than as a success.

Deleting an asset first asks `media_references()` which projects, entries, pages or
blocks still point at it, and names them before letting you continue.

## Deploy to Vercel

1. Push to GitHub and import the repo in Vercel.
2. Add **all env vars** from the table above (Production + Preview).
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin.
4. Deploy. Public pages use ISR (`revalidate = 60`) and every CMS save calls
   `revalidatePath`, so published edits appear within seconds.

## Content model

```
site_owners     who may administer the site (no RLS policies — service role only)
settings        key/value jsonb (hero_roles, socials, nav, featured)
categories/tags taxonomy (+ project_tags / journal_tags joins)
projects        slug, stream, status, featured, meta jsonb (role/tools/client/links)
journal_posts   slug, status, featured, reading_minutes
pages           home/about/connect — structured data jsonb, edited as forms
content_blocks  POLYMORPHIC: owner_type (project|journal|page) + owner_id + type + position + data
media           Cloudinary asset registry (public_id, alt, folder, dimensions)
messages        Connect inbox — public INSERT (rate-limited), owner read/update/delete
```

### Saving is atomic

`save_project()` and `save_journal_post()` (migration 0004) write metadata, blocks
and tags inside one plpgsql function, so the client makes a single call and
Postgres wraps it in one transaction. Before that, a save was four round-trips that
started by deleting the old blocks — a failure halfway through left a published
project with its body wiped. Malformed payloads are now rejected before anything
is written, both in the server action and again in the function.

### Block engine

One block system shared by projects, journal, and pages. Types:
`heading · paragraph · markdown · image · gallery · youtube · embed · quote ·
divider · code · button · link · file · custom`.

Adding a type = two map entries:
- renderer → `components/blocks/renderer.tsx`
- editor form → `components/admin/block-editors.tsx`
- (`custom` blocks resolve through `components/lab/registry.tsx` — that's how Lab
  experiments can be embedded into any project or journal entry.)

### RLS summary

- `anon`: SELECT published projects/journal (+ their blocks/tag joins), plus
  pages/tags/categories/settings; INSERT into `messages`, validated for length and
  email shape and rate-limited by a database trigger (3/hour per address, 30/hour
  overall). Rate limiting in the form component alone protected nothing — the anon
  INSERT policy is reachable directly with the public key.
- `authenticated` **that is not an owner**: exactly the same read access as a
  visitor, and no writes.
- `authenticated` **that is an owner** (`is_site_owner()`): full read/write.

Server Actions call `checkOwner()` first and RLS enforces the same rule at the
database, so a route that slipped past middleware still cannot write.

### Failures are visible

`lib/data.ts` checks `error` on every read and throws `DataUnavailableError`; pages
wrap reads in `load()` and render a "content unavailable" state. Three situations
that used to look identical — *nothing published yet*, *nothing matched your
filter*, and *the query failed* — now read differently on Home, Works and Journal.
A failed read on a detail page renders that state instead of a 404, so an outage
never tells a crawler the work does not exist.

## Design system

Tokens live in `app/globals.css` (CSS variables, single source) and are mapped in
`tailwind.config.ts`.

- **Dark = Night** (`#0a0a0a`, the default) with cards at `#121212` / `#1a1a1a`;
  **Light = Paper** (`#f4efe3` warm cream). The toggle persists to `localStorage`
  and is applied by an inline `<head>` script → no flash.
- **Accents:** 🟡 highlighter/primary `#f5c518` (the signature — also the link and
  primary-action colour, `#8a6a00` on light for contrast) · 🔴 coral `#ff6b5b`
  for emphasis and marginalia · 🟢 teal `#18d9b4` as the third stream marker.
  Colour never carries meaning alone — stream dots are always paired with a label.
- **The notebook is the layout.** A ledger-strip masthead, a numbered home Index,
  filing-tabs on Works, a diary date-rail on journal entries, and `EntryMeta` mono
  ledger lines tie every page to one archival language. Selected work sits *above*
  the Index: a visitor should meet real work before a table of contents.
- **Type:** Fraunces (display) + Inter (body, 16px floor, 1.7 line-height) +
  JetBrains Mono (metadata) + Caveat strictly for marginalia. Smallest step is
  12px; `--faint` was re-derived to clear 4.5:1 against both themes' surfaces
  (it previously sat at 3.7:1 dark / 3.3:1 light).
- **Motion:** 150/250/400 ms, `cubic-bezier(0.22,1,0.36,1)`, every animation has a
  reduced-motion fallback.

## Decisions & assumptions

1. **Streams are query params** (`/works?stream=visual-design`) rather than nested
   routes — one curated index, three filtered landings.
2. **Ownership is explicit membership**, not "any authenticated user". See
   migration 0003.
3. **Home / About / Connect are edited as forms**, driven by
   `components/admin/page-schemas.ts`. Updating a bio should not mean editing JSON,
   and a stray comma should not be able to blank a page. Any page without a schema
   falls back to a JSON editor that refuses to save invalid input.
4. **Nothing about Hilman is hard-coded.** The footer blurb, the location line and
   the specimen-plate rows come from the Home page record; `DEFAULT_SETTINGS.socials`
   is empty on purpose, and the "Elsewhere" lists stay hidden until real accounts
   are entered. Placeholder profile links shipped to the live site once already.
5. **Editors never lose work silently.** The live editor and the page/settings
   forms track a dirty flag, warn before unload, keep a local draft, and *offer* it
   back on return. "Saved" describes the version that was saved and disappears the
   moment anything changes.
6. **Archiving ≠ deleting.** Messages have a lifecycle (new → read → followed up →
   archived); permanent deletion is a separate, confirmed action.
7. **Gallery items and custom-block props** edit as inline JSON inside the block
   builder — pragmatic now, swappable for richer sub-forms later.
8. **Markdown is trusted** (rendered via `marked`): the only author is the owner.
9. **Lab ≠ Digital Lab**: Lab is the live playground (`ink-field`, `doodle-pad`);
   Digital Lab is the stream of finished tech projects.
10. ESLint isn't wired in — `next build` runs full TypeScript checks.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build (type-checked) |
| `npm start` | serve the production build |
| `npm run typecheck` | TypeScript only, no build |
| `npm run owner` | list owners; `-- add <email>` / `-- remove <email>` |
| `npm run seed -- --force` | **destructive** — wipes content, inserts demo material |
