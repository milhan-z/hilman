# Backup and restore

Git holds the code. It does not hold a single word of the site's content — that
lives in Supabase, the images live in Cloudinary, and Loop Clips and Journal
voice notes live in Cloudflare R2. Losing any one of them loses part of the
archive, and a backup you have never restored is not a backup.

## What has to be backed up

| Store | Holds | Recovery without a backup |
|---|---|---|
| Supabase Postgres | projects, journal, pages, blocks, tags, settings, messages, media registry | none |
| Cloudinary | every image and file | none |
| Cloudflare R2 | Loop Clips (`clips/`) and Journal voice notes (`voice-notes/`) | none |
| Git | code, migrations, design tokens | full |

## Supabase

**Automatic.** Check the actual project's backup retention and point-in-time
recovery entitlement in **Project Settings → Database → Backups**. Do not assume
that a free project has automatic backups or PITR, or that a paid plan includes
every recovery option. Record the last successful backup and its retention.

**Manual, and the one you control:**

```bash
# Schema only: the CLI's default dump does NOT include content rows.
supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/hilman-schema-$(date +%F).sql

# Data is a separate, required dump.
supabase db dump --db-url "$SUPABASE_DB_URL" --data-only -f backups/hilman-data-$(date +%F).sql
```

The connection string is at **Project Settings → Database → Connection string**.
It contains the database password — keep the dumps out of the repository
(`backups/` is already gitignored) and off shared drives.

Create the backup directory with restrictive permissions, use securely supplied
credentials, and never paste a connection string into chat or a committed file.
Keep an encrypted copy outside this development environment. Save the matching
Git commit, applied migration list, tool versions, timestamps and checksums in
the backup manifest. Two separate CLI commands do not share a database snapshot;
take them during a quiet editing window and verify both completed successfully.
The CLI excludes managed schemas such as Auth by default: these files are not a
complete Supabase project backup. Auth users, secrets and provider configuration
need the platform's supported backup/restore process too.

For the migration-first scratch rehearsal below, a portable **application data**
archive avoids carrying owner identities and session bookkeeping into another
project. With a compatible PostgreSQL client, create it in one snapshot:

```bash
pg_dump --dbname="$SUPABASE_DB_URL" --format=custom --data-only --schema=public \
  --exclude-table-data=public.profiles \
  --exclude-table-data=public.site_owners \
  --exclude-table-data=public.studio_mutations \
  --exclude-table-data=public.studio_pin_attempts \
  --file=backups/hilman-application-data.dump
```

This is a portable content recovery archive, not a replacement for the complete
backup. Preserve the original backup too. `profiles.id`, `site_owners.user_id`
and `studio_mutations.owner_id` reference Auth users; those identities must be
preserved or explicitly mapped during a full recovery. A fresh-project rehearsal
recreates the owner instead. Its excluded mutation ledger also means old device
outboxes must not be replayed against the scratch project.

Run this before anything that changes shape: a migration, `npm run seed --force`,
or a bulk delete.

## Cloudinary

Assets are not covered by the Supabase backup. Either:

- **Cloudinary's own backup** — Settings → Backup, which versions assets to your
  own storage bucket, or
- **A verified export/download workflow** using the provider's supported tools
  or Admin API. Include originals for both image and raw/file resource types,
  paginate the inventory, and preserve public IDs, formats and folders in a
  manifest. Confirm the exact commands against the installed tool version;
  the previously listed `npx cloudinary-cli download` command was not verified.

The `media` table and Cloudinary must be restored together: a database row whose
`public_id` no longer exists renders as a broken image. Include assets named by
content/settings as well as the library, and do not assume everything is in the
`hilman` folder. Check downloaded counts and bytes against the inventory.

## Cloudflare R2

This application creates no automatic R2 backup, and there is no media-library row for its
objects: the database holds the reference (a Loop Clip block's URL, a journal
entry's `voice_note.src` key) and R2 holds the bytes. Copy the bucket with any
S3-compatible tool, using an R2 API token with read access:

```bash
rclone copy "r2:YOUR_BUCKET/clips" ./backups/r2/clips
rclone copy "r2:YOUR_BUCKET/voice-notes" ./backups/r2/voice-notes
```

Replace `YOUR_BUCKET` with the verified source bucket and configure the `r2`
remote through secure local settings. Record object keys, sizes, content types
and available checksums alongside the copies. Restore both halves together,
as with Cloudinary. A provider ETag is not always a whole-file checksum.

**Orphans are expected.** Studio never deletes from R2. Replacing or removing a
voice note leaves the old file in `voice-notes/`, unreferenced — on purpose, so
a failed save can never cost a recording. To find them for a later cleanup,
list `voice-notes/` and compare against
`select voice_note->>'src' from journal_posts where voice_note is not null`.
Anything listed by the bucket and not by the query is unreferenced *by the
database* — which is not the same as unwanted. A phone can hold a queued save
or a recovery copy naming a recording that has uploaded but not been saved
yet. Clean up only objects older than a few weeks, and only once every device
that edits the site shows nothing waiting in Sync status. Removed recordings
stay reachable by anyone who has their exact URL until then.

## Restore — rehearse it, don't trust it

Restoring into production for the first time during an actual incident is how
backups turn out to be empty. Do this once, in a scratch project:

Use **one** schema strategy: restore the schema dump into a compatible empty
target, or apply the matching repository migrations and restore **data only**.
Do not apply migrations and then load the schema dump over the same tables.
For the second strategy:

1. Create a second, throwaway Supabase project. Confirm its identity before any
   restore command. Keep it separate from production and from editing devices.
2. Apply the migrations recorded for the backup in order. This checkout now
   contains `0001` → `0015`; that is not evidence that production has all of
   them. Restore older data into its matching schema, then test later migrations
   locally. Do not repair the production migration history as part of a rehearsal.
3. Inspect the archive with `pg_restore --list`, then restore the portable
   application-data archive into the empty scratch tables:
   ```bash
   pg_restore --dbname="$SCRATCH_DB_URL" --data-only --no-owner --no-privileges \
     --single-transaction --exit-on-error --disable-triggers \
     backups/hilman-application-data.dump
   ```
   Trigger suppression during this isolated restore prevents the inbox's live
   anti-spam/timestamp triggers from rejecting or rewriting historical messages.
   It requires database privileges the managed project may not grant. If refused,
   stop and use Supabase's supported restore procedure; do not bypass checks or
   import part of the archive and call it restored. The command is a single
   transaction and re-enables triggers after loading. Validate foreign-key
   relationships and content counts afterward; bypassed triggers do not validate
   imported rows retroactively.
4. Create the scratch Auth account, point local configuration at the **scratch**
   project, and run `npm run owner -- add you@example.com` there. Never run the
   owner command while its environment still names production.
5. Start locally with a clean browser profile. Do not connect a phone holding
   queued production saves to the scratch project. Export/preserve recovery
   drafts first; they are not included in a database backup.
6. Check project/journal/page counts, blocks and tags, private drafts, publication
   dates, `voice_note` metadata, settings and historical messages. Verify the
   public API cannot enumerate the media library after `0015`, while the owner
   still can. Reconnect media copies in separate scratch storage and check image
   delivery, Loop Clips and voice-note playback/Range without modifying originals.
7. Record results, failures, row/asset counts, and the time needed to recover.
   Remove only the explicitly identified throwaway project after review.

Write the date you last did this somewhere you will see it. If it is more than a
few months old, the answer to "do we have backups" is honestly "we don't know".

**Audit status, 12 October 2026:** these instructions were corrected against the
repository and its local migration tests. No live database was inspected, dumped,
restored or migrated, and no provider backup/recovery was performed. A successful
local migration test is not a successful backup rehearsal.
