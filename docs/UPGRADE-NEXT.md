# Upgrading off Next.js 14

**Status: planned, not done.** `master` still runs Next.js 14 (lockfile pins
`14.2.35`). Do this on a branch, not here.

## Why

Next.js 14 is on the framework's unsupported list, so it no longer receives
security or bug fixes. That is a maintenance fact, not evidence that this
deployment has been exploited — nothing here suggests it has.

At the time of writing the stable lines are **15.5.x** and **16.3.x**.
Go to **15.5.x first**. It is one hop, the codemod covers most of it, and it
gets the project onto a supported line; 16 can follow once 15 is verified.

## What actually breaks

The migration that matters for this codebase is that request-scoped APIs became
asynchronous in 15. Every one of these has to be awaited:

| API | Where it is used here |
|---|---|
| `cookies()` | `lib/supabase/server.ts` |
| `params` / `searchParams` in a page or layout | `app/(site)/works/[slug]/page.tsx`, `app/(site)/journal/[slug]/page.tsx`, `app/(site)/works/page.tsx`, `app/admin/pages/[slug]/page.tsx`, `app/admin/projects/[id]/page.tsx`, `app/admin/journal/[id]/page.tsx`, `app/admin/messages/page.tsx` |
| `generateMetadata({ params })` | both public detail routes |

Two more to check rather than assume:

- **Caching defaults changed.** `fetch` and route handlers are no longer cached by
  default in 15. This project reads through the Supabase client rather than `fetch`
  and sets `revalidate` explicitly per route, so the exposure is small — but the
  ISR behaviour of `/`, `/works`, `/journal`, `/about`, `/connect` must be
  re-checked after the upgrade, not assumed.
- **React 19.** Next 15 expects it. `useFormState` is deprecated in favour of
  `useActionState`; it still works, but `components/admin/live-editor.tsx`,
  `media-library.tsx` and `login/page.tsx` use it and should move over.
  `framer-motion@11` needs a compatibility check against React 19.

## Steps

```bash
git switch -c chore/next-15
npx @next/codemod@canary upgrade latest     # or: npx @next/codemod@latest next-async-request-api .
npm install
npm run typecheck
npm run build
```

The codemod handles most `await` insertions. Read its diff — it is conservative
and sometimes wraps things in `await` that were already fine.

## Verify before merging

Do not merge on a green build alone. With a real Supabase project connected:

- [ ] Sign in as the owner; sign in as a non-owner and confirm the studio refuses.
- [ ] Save a project: metadata, blocks and tags all land; the slug conflict path
      still reports "that slug is already taken".
- [ ] Simulate a failed save (rename a column temporarily, or revoke a policy) and
      confirm the previously published version is untouched.
- [ ] Upload an image, then delete one that is still referenced and confirm the
      warning lists the places using it.
- [ ] Publish and unpublish a project; confirm the public page and the sitemap
      both follow within the revalidate window.
- [ ] Submit the Connect form; confirm the row appears in the inbox.
- [ ] Check `/robots.txt`, `/sitemap.xml`, and one `og:image` all carry the
      production domain.
- [ ] Mobile widths 360–430 px, keyboard-only navigation, both themes,
      `prefers-reduced-motion`.

## After it lands

Re-pin the lockfile and keep the dependency line current — the point of this
upgrade is to stay on a supported release, which only holds if it is repeated.
