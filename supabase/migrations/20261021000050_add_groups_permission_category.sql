-- Add groups to permission_category for custom recipient groups (#819).
-- Its own migration: a new enum value cannot be used in the transaction that adds it.
--
-- Rollback: none needed. An unused enum value is harmless, and Postgres cannot drop one.
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'groups';
