-- Migration: Fix audit_logs foreign key to profiles
-- Changes actor_id FK from auth.users to profiles for proper joins

BEGIN;

-- 1. Drop existing FK constraint to auth.users
ALTER TABLE audit_logs 
  DROP CONSTRAINT IF EXISTS audit_logs_actor_id_fkey;

-- 2. Add FK constraint to profiles with SET NULL on delete
-- (Preserves audit logs even if profile is deleted)
ALTER TABLE audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey
  FOREIGN KEY (actor_id) 
  REFERENCES profiles(id) 
  ON DELETE SET NULL;

-- 3. Make actor_id nullable to support SET NULL behavior
ALTER TABLE audit_logs 
  ALTER COLUMN actor_id DROP NOT NULL;

-- 4. Update comment to reflect the change
COMMENT ON COLUMN audit_logs.actor_id IS 'The user profile who performed the action (nullable if profile deleted)';

COMMIT;
