-- #1247: allow JPEG, PNG and WebP images in the documents storage bucket.
-- Keep in step with ALLOWED_DOCUMENT_MIME_TYPES in src/types/database.ts.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp'
]
WHERE id = 'documents';

-- Rollback (restores the original 4 types):
-- UPDATE storage.buckets
-- SET allowed_mime_types = ARRAY[
--   'application/pdf',
--   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
--   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--   'text/plain'
-- ]
-- WHERE id = 'documents';
