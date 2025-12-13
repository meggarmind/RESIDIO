-- Migration: Audit Logging System
-- Phase 8: Immutable, append-only table for tracking all significant actions
-- Designed for seamless integration with future modules

-- 1. Create audit_action enum for type safety
DO $$ BEGIN
  CREATE TYPE audit_action AS ENUM (
    'CREATE',
    'UPDATE',
    'DELETE',
    'VERIFY',
    'APPROVE',
    'REJECT',
    'ASSIGN',
    'UNASSIGN',
    'ACTIVATE',
    'DEACTIVATE',
    'GENERATE',    -- For invoice/levy generation
    'ALLOCATE',    -- For wallet allocations
    'LOGIN',       -- Future: auth events
    'LOGOUT'       -- Future: auth events
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who performed the action
  actor_id UUID NOT NULL REFERENCES auth.users(id),

  -- What action was performed
  action audit_action NOT NULL,

  -- What entity was affected
  entity_type TEXT NOT NULL,  -- 'residents', 'houses', 'invoices', etc.
  entity_id UUID NOT NULL,
  entity_display TEXT,        -- Human-readable: "John Doe", "House #42"

  -- What changed (for UPDATE actions)
  old_values JSONB,
  new_values JSONB,

  -- Context
  description TEXT,           -- Optional human-readable description
  metadata JSONB,             -- Additional context (batch_id, related entities, etc.)

  -- Request context (optional)
  ip_address INET,
  user_agent TEXT,

  -- Timestamp (immutable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Create indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_created ON audit_logs(entity_type, created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);

-- 4. Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Only admins and chairman can view audit logs
DROP POLICY IF EXISTS "Admins and chairman can view audit logs" ON audit_logs;
CREATE POLICY "Admins and chairman can view audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman')
    )
  );

-- All authenticated users can insert (via server actions)
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON audit_logs;
CREATE POLICY "Authenticated users can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- NO UPDATE OR DELETE policies (immutable) - this is intentional

-- 6. Add comments for documentation
COMMENT ON TABLE audit_logs IS 'Immutable audit trail for all significant actions. Cannot be updated or deleted. Designed for compliance and debugging.';
COMMENT ON COLUMN audit_logs.actor_id IS 'The user who performed the action';
COMMENT ON COLUMN audit_logs.action IS 'The type of action performed (CREATE, UPDATE, DELETE, etc.)';
COMMENT ON COLUMN audit_logs.entity_type IS 'The type of entity affected (residents, houses, invoices, etc.)';
COMMENT ON COLUMN audit_logs.entity_id IS 'The ID of the affected entity';
COMMENT ON COLUMN audit_logs.entity_display IS 'Human-readable name/identifier for the entity';
COMMENT ON COLUMN audit_logs.old_values IS 'Previous values before the change (for UPDATE actions)';
COMMENT ON COLUMN audit_logs.new_values IS 'New values after the change';
COMMENT ON COLUMN audit_logs.description IS 'Optional human-readable description of the action';
COMMENT ON COLUMN audit_logs.metadata IS 'Additional context like batch_id, related entities, etc.';
