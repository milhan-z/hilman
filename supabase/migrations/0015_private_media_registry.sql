-- The media library is Studio metadata, not a public catalogue.
--
-- 0002 let anonymous readers enumerate every Cloudinary public_id, title,
-- alt text and folder, including assets attached only to drafts or uploaded
-- for later. Public pages already carry their published media references in
-- the content itself and never need to query this registry.
--
-- Keep the existing owner policy from 0003. This does not remove provider
-- objects, change public content, or make an already-known media URL private.
-- Forward-only and safe to apply more than once.

drop policy if exists "public read media" on public.media;

notify pgrst, 'reload schema';
