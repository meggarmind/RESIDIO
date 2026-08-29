-- ============================================================================
-- Migration: Make profiles.role nullable
-- ============================================================================
-- Purpose: profiles.role_id is authoritative as of
--          20260829100200_gate_auth_helpers_on_account_status.sql. The NOT NULL
--          constraint on the legacy profiles.role column is now purely harmful:
--
--          assignRoleToResident (src/actions/roles/assign-role.ts) writes
--          role: null for vice_chairman, secretary, project_manager and
--          resident, because those four have no legacy equivalent. Against a
--          NOT NULL column that write raises 23502 and surfaces to the user as
--          "Failed to assign role" - so four of the eight roles cannot be
--          assigned at all today. removeRoleFromResident always writes null, so
--          role removal is broken outright.
--
--          Dropping NOT NULL fixes both. The column is kept because
--          auth-provider.tsx and middleware.ts still select it; it is simply no
--          longer required or authoritative. Removing the column entirely is a
--          separate change once those readers are retired.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ALTER COLUMN role DROP NOT NULL,
    ALTER COLUMN role DROP DEFAULT;

COMMENT ON COLUMN public.profiles.role IS
'DEPRECATED legacy role. Not authoritative and no longer required - profiles.role_id is the
source of truth and get_my_role() derives the legacy enum from it. Retained only for
backward compatibility with remaining readers; do not gate access on this column.';

COMMIT;
