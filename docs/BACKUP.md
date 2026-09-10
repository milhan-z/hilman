# Backup and restore

Git holds the code. It does not hold a single word of the site's content — that
lives in Supabase, and the images live in Cloudinary. Losing either one loses the
archive, and a backup you have never restored is not a backup.

## What has to be backed up

| Store | Holds | Recovery without a backup |
|---|---|---|
| Supabase Postgres | projects, journal, pages, blocks, tags, settings, messages, media registry | none |
| Cloudinary | every image and file | none |
| Git | code, migrations, design tokens | full |

## Supabase

**Automatic.** Supabase takes daily backups on paid plans; free projects get
point-in-time recovery only for a short window and are paused after inactivity.
Check which one applies at **Project Settings → Database → Backups**, and don't
assume the free tier is covering you.

**Manual, and the one you control:**

```bash
# whole database, schema + data
supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/hilman-$(date +%F).sql

# data only, if you just want the content
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backups/hilman-data-$(date +%F).sql
```

The connection string is at **Project Settings → Database → Connection string**.
It contains the database password — keep the dumps out of the repository
(`backups/` is already gitignored) and off shared drives.

Run this before anything that changes shape: a migration, `npm run seed --force`,
or a bulk delete.

## Cloudinary

Assets are not covered by the Supabase backup. Either:

- **Cloudinary's own backup** — Settings → Backup, which versions assets to your
  own storage bucket, or
- **A local pull:**

```bash
npx cloudinary-cli download --folder hilman --output ./backups/media
```

The `media` table and Cloudinary must be restored together: a database row whose
`public_id` no longer exists renders as a broken image.

## Restore — rehearse it, don't trust it

Restoring into production for the first time during an actual incident is how
backups turn out to be empty. Do this once, in a scratch project:

1. Create a second, throwaway Supabase project.
2. Apply the migrations in order (`0001` → `0004`).
3. Load the dump:
   ```bash
   psql "$SCRATCH_DB_URL" -f backups/hilman-2026-09-10.sql
   ```
4. Add yourself as owner there: `npm run owner -- add you@example.com`
   (`site_owners` references `auth.users`, and those ids differ per project — the
   restored rows will not match.)
5. Point a local `.env.local` at the scratch project and run `npm run dev`.
6. Check that projects, journal entries, pages, images and messages are all there.
7. Delete the scratch project.

Write the date you last did this somewhere you will see it. If it is more than a
few months old, the answer to "do we have backups" is honestly "we don't know".
