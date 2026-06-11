# Hilman. — personal creative archive + CMS

A living creative archive for **Hilman** — creative technologist working between
**design · media · tech**. Built like a designer's notebook: paper surfaces, a
highlighter, an ink pen, and a red pen — disciplined, not scrapbook.

- **Public site:** Home, Works (3 streams), project details rendered by a polymorphic
  block engine, Journal (digital garden), Lab (live experiments), About, Connect,
  and Hilman's Desk (interactive).
- **CMS (`/admin`):** single-user studio — projects & journal with a drag-reorder
  block builder, page editor, media library (signed Cloudinary uploads), taxonomy,
  settings, messages inbox.

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

## Quick start (zero setup)

```bash
npm install
npm run dev
```

**The site runs immediately without any env vars** — when Supabase isn't configured,
the public pages serve mock content from `lib/mock.ts` (the same content the seed
script inserts). `/admin` shows a setup notice until Supabase is wired up.

## Full setup

### 1. Environment

```bash
cp .env.example .env.local
```

| Var | Where to get it | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page | public |
| `SUPABASE_SERVICE_ROLE_KEY` | same page — **server-only**, used by seed | secret |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloudinary dashboard | public |
| `CLOUDINARY_API_KEY` | Cloudinary dashboard | secret |
| `CLOUDINARY_API_SECRET` | Cloudinary dashboard — signs uploads | secret |
| `NEXT_PUBLIC_SITE_URL` | your deployed URL, no trailing slash | public |

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the migrations **in order** in the SQL editor (or `supabase db push`):
   - `supabase/migrations/0001_init.sql` — tables, enums, indexes, triggers
   - `supabase/migrations/0002_rls.sql` — RLS policies
3. Create the owner account: **Authentication → Users → Add user** (email + password).
4. **Disable public sign-ups**: Authentication → Providers → Email → turn off
   "Allow new users to sign up". RLS treats *any authenticated user as the owner*,
   so this switch is what makes the CMS single-user.
5. Seed the content:

```bash
npm run seed
```

The seed wipes content tables and inserts the mock content (6 projects across the
3 streams, 4 journal entries, all pages, settings, tags) so the site is alive on
first load. Idempotent — run it again any time.

### 3. Cloudinary (signed uploads)

No unsigned presets. The flow is:

1. Admin client `POST`s to `/api/cloudinary/sign` (requires a Supabase session).
2. The route signs `{ folder, timestamp }` with `CLOUDINARY_API_SECRET` (sha1).
3. The browser uploads the file **directly to Cloudinary** with that signature.
4. The asset is recorded in the `media` table (alt text, folder, dimensions).

Delivery URLs are built in `lib/cloudinary.ts` with `f_auto,q_auto,w_…,c_limit`
through `next/image`. Mock/seed content uses absolute `picsum.photos` URLs —
every media field accepts *either* a Cloudinary `public_id` or a full URL, so you
can replace placeholders gradually from the CMS.

### 4. YouTube

Videos are a `youtube` block storing only the `youtube_id`. The renderer is a
**facade**: a thumbnail + play button; the actual iframe (youtube-nocookie.com)
is injected only when clicked, keeping ~1 MB of player JS off the critical path.

## Deploy to Vercel

1. Push the repo to GitHub and import it in Vercel (framework auto-detected).
2. Add **all env vars** from the table above (Production + Preview).
3. Set `NEXT_PUBLIC_SITE_URL` to the production URL.
4. Deploy. Public pages use ISR (`revalidate = 60`) and every CMS save calls
   `revalidatePath`, so published edits appear within seconds.

## Content model

```
settings        key/value jsonb (hero_roles, socials, nav, featured)
categories/tags taxonomy (+ project_tags / journal_tags joins)
projects        slug, stream, status, featured, meta jsonb (role/tools/client/links)
journal_posts   slug, status, featured, reading_minutes
pages           home/about/connect/desk — structured data jsonb
content_blocks  POLYMORPHIC: owner_type (project|journal|page) + owner_id + type + position + data
media           Cloudinary asset registry (public_id, alt, folder, dimensions)
messages        Connect form inbox (public INSERT, owner SELECT/DELETE)
```

### Block engine

One block system shared by projects, journal, and pages. Types:
`heading · paragraph · markdown · image · gallery · youtube · embed · quote ·
divider · code · button · link · file · custom`.

Adding a type = **two map entries**:
- renderer → `components/blocks/renderer.tsx`
- editor form → `components/admin/block-editors.tsx`
- (`custom` blocks resolve through `components/lab/registry.tsx` — that's how the
  Lab experiments can be embedded into any project or journal entry.)

### RLS summary

- `anon`: SELECT published projects/journal (+ their blocks/tag joins), all
  pages/tags/categories/media/settings; INSERT into `messages` (length-validated).
- `authenticated` (= the owner): full read/write on everything; only role that can
  read `messages`.
- Server Actions run with the caller's session, so **even if a route were exposed,
  the database refuses writes from non-owners**.

## Design system

Tokens live in `app/globals.css` (CSS variables, single source) and are mapped in
`tailwind.config.ts`:

- **Light = Paper** (`#f6f3ec` warm cream), **Dark = Ink** (`#15151a` warm charcoal).
  Toggle in the nav: follows `prefers-color-scheme`, persists to `localStorage`,
  applied by an inline `<head>` script → no flash.
- **Stationery accents** (semantic, not decorative): 🟡 highlighter = featured/
  pinned/active · 🔵 ink pen = links/primary/focus · 🔴 red pen = emphasis/
  marginalia/destructive. One dominant accent per screen; red used sparingly.
- **Type:** Fraunces (display) + Inter (body, 16px floor, 1.7 line-height) +
  Caveat strictly for marginalia/labels. Modular scale ≈ 1.25.
- **Motion:** 150/250/400 ms, `cubic-bezier(0.22,1,0.36,1)`, every animation has a
  reduced-motion fallback (hero rotation → static, reveals → plain, canvas → still frame).

## Decisions & assumptions

1. **Streams are query params** (`/works?stream=visual-design`) rather than nested
   routes — one curated index, three filtered landings with their own intro copy.
2. **Mock-content fallback** doubles as the seed source (`lib/mock.ts`) — one source
   of truth, and the repo demos itself without credentials.
3. **Single-owner auth = "any authenticated user"** + sign-ups disabled in Supabase.
   Simplest correct model for a personal CMS; no role tables to maintain.
4. **Pages editor is structured JSON** with per-page key hints (validated on save).
   Home/About/Connect/Desk have fixed, designed layouts; their *content* is editable
   without letting layout drift. Projects/journal get the full block builder.
5. **Gallery items and custom-block props** edit as inline JSON inside the block
   builder (with live validation) — pragmatic now, swappable for richer sub-forms
   later since editors are mapped per type.
6. **Markdown is trusted** (rendered via `marked`): the only authors are the owner
   through the CMS; no third-party UGC passes through the renderer.
7. **Lab ≠ Digital Lab**: Lab is the live playground (`ink-field`, `doodle-pad`);
   Digital Lab is the stream of finished tech projects. The Lab page links the
   distinction explicitly.
8. **Media deletes** also destroy the Cloudinary asset (signed `destroy` call).
9. ESLint isn't wired in (no config) — `next build` runs full TypeScript checks;
   add `eslint-config-next` later if wanted.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server at `localhost:3000` |
| `npm run build` | production build (type-checked) |
| `npm start` | serve the production build |
| `npm run seed` | wipe + insert mock content into Supabase (needs service role key) |
