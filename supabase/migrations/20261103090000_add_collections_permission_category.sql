-- Add collections to permission_category for the Collections ledger (#1194, slice 6 of #1188).
-- Its own migration: a new enum value cannot be used in the transaction that adds it.
--
-- VERIFY (expected result in brackets):
--   SELECT 'collections' = ANY (enum_range(NULL::public.permission_category)::text[]);  -- [true]
--
-- Rollback: none needed. An unused enum value is harmless, and Postgres cannot drop one.
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'collections';
