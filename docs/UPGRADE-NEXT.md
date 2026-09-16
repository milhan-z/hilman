# Next.js 16 migration

Upgraded to **Next.js 16.3.5** and **React 19.3.0**, with matching React types.
Node.js 20.9 or later is required; verification used Node.js 24.11.0.
Framer Motion remains at 11.18.2, whose peer dependencies support React 19.

## Changes

- The official async-request codemod migrated route `params`, `searchParams`,
  and metadata inputs. The Supabase server client awaits `cookies()` and every
  consumer awaits the server client.
- `middleware.ts` became `proxy.ts`; redirects preserve refreshed session cookies.
- Forms now use React's `useActionState`. Block types use `React.JSX.Element`.
- The Open Graph image uses the Node.js runtime. Turbopack handles development
  and production builds with Next.js defaults.
- Owner authorization fails closed if the owner RPC is missing, ambiguous,
  unavailable, or returns anything other than boolean `true`.
- Public content errors no longer display database diagnostics.

## Verification

```bash
npm run typecheck
npm test
npm run build
npm audit
```

TypeScript, owner-policy regression tests, and the production build passed.
The dependency audit reported zero vulnerabilities after compatible updates.
Building requires network access for the existing Google Fonts configuration.

An anonymous, read-only RPC check confirmed the database denies access to
`is_site_owner` with HTTP 401 / PostgreSQL code 42501. This verifies that the
function exists and is unavailable to anonymous visitors; it does not replace
authenticated owner/non-owner testing. No schema changes were applied.

Before deployment, set `NEXT_PUBLIC_SITE_URL` to the actual public domain and
verify owner login, project saves, media uploads, publishing, and the contact
form against the intended database. These workflows create records and were
not exercised by the migration's read-only checks.

Official references: [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16),
[Next.js 15 async API migration](https://nextjs.org/docs/app/guides/upgrading/version-15),
[Supabase server clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client).