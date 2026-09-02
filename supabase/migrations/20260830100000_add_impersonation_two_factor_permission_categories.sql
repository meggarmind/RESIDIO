-- ============================================================================
-- Migration: Add the impersonation and two_factor permission categories
-- ============================================================================
-- Purpose: `permission_category` has no value for either module, so the twelve
--          permissions those modules check against could never be seeded.
--
-- Split from the seed that follows it deliberately: Postgres will not let a
-- newly added enum value be used in the same transaction that adds it, and
-- every other enum-add in this repo is likewise its own file.
--
-- The two values may already exist in a given environment (the live project
-- reports them in its introspected types, though no migration ever added them),
-- so both adds are IF NOT EXISTS.
-- ============================================================================

ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'impersonation';
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'two_factor';
