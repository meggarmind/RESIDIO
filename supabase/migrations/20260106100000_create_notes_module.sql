-- Migration: Create Notes Module
-- Provides polymorphic note-taking for Residents and Houses with version history,
-- document attachments, categories, and role-based visibility.

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Note target entity type (polymorphic - matches audit_logs pattern)
CREATE TYPE note_entity_type AS ENUM ('resident', 'house');

-- Note categories for organization
CREATE TYPE note_category AS ENUM (
  'general',
  'agreement',
  'complaint',
  'reminder',
  'financial',
  'security',
  'maintenance',
  'legal'
);

-- ============================================================================
-- ENTITY NOTES TABLE
-- ============================================================================

CREATE TABLE entity_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Polymorphic reference (entity_type + entity_id pattern from audit_logs)
  entity_type note_entity_type NOT NULL,
  entity_id UUID NOT NULL,

  -- Content
  title TEXT, -- Optional title for the note
  content TEXT NOT NULL,
  category note_category NOT NULL DEFAULT 'general',

  -- Confidentiality (role-based visibility)
  is_confidential BOOLEAN NOT NULL DEFAULT FALSE,
  confidential_roles TEXT[] DEFAULT NULL, -- Array of role names that can view

  -- Optional document attachment (links to existing document system)
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,

  -- Version tracking (soft-edit with history)
  version INT NOT NULL DEFAULT 1,
  parent_note_id UUID REFERENCES entity_notes(id) ON DELETE SET NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,

  -- Metadata
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary query pattern: get current notes for an entity
CREATE INDEX idx_entity_notes_entity ON entity_notes(entity_type, entity_id);
CREATE INDEX idx_entity_notes_current ON entity_notes(entity_type, entity_id, is_current)
  WHERE is_current = TRUE;

-- Version history queries
CREATE INDEX idx_entity_notes_parent ON entity_notes(parent_note_id)
  WHERE parent_note_id IS NOT NULL;

-- Category filtering
CREATE INDEX idx_entity_notes_category ON entity_notes(category);

-- Timeline sorting
CREATE INDEX idx_entity_notes_created_at ON entity_notes(created_at DESC);

-- Confidential notes filtering
CREATE INDEX idx_entity_notes_confidential ON entity_notes(is_confidential)
  WHERE is_confidential = TRUE;

-- Document reference lookup
CREATE INDEX idx_entity_notes_document ON entity_notes(document_id)
  WHERE document_id IS NOT NULL;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER entity_notes_updated_at
  BEFORE UPDATE ON entity_notes
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE entity_notes ENABLE ROW LEVEL SECURITY;

-- SELECT Policy: Users with notes.view permission can see notes
-- Confidential notes require notes.view_confidential OR user's role in confidential_roles
CREATE POLICY "Users can view notes based on permissions"
  ON entity_notes
  FOR SELECT
  TO authenticated
  USING (
    -- Must have notes.view permission
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN app_roles ar ON ar.id = p.role_id
      JOIN role_permissions rp ON rp.role_id = ar.id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'notes.view'
    )
    AND (
      -- Non-confidential notes: visible to all with notes.view
      is_confidential = FALSE
      OR
      -- Has view_confidential permission
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN app_roles ar ON ar.id = p.role_id
        JOIN role_permissions rp ON rp.role_id = ar.id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        WHERE p.id = auth.uid() AND ap.name = 'notes.view_confidential'
      )
      OR
      -- User's role is in the confidential_roles array
      EXISTS (
        SELECT 1 FROM profiles p
        JOIN app_roles ar ON ar.id = p.role_id
        WHERE p.id = auth.uid() AND ar.name = ANY(confidential_roles)
      )
    )
  );

-- INSERT Policy: Users with notes.create permission can create notes
CREATE POLICY "Users can create notes"
  ON entity_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN app_roles ar ON ar.id = p.role_id
      JOIN role_permissions rp ON rp.role_id = ar.id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'notes.create'
    )
  );

-- UPDATE Policy: Users with notes.update permission can update notes
-- (mainly for setting is_current = FALSE during versioning)
CREATE POLICY "Users can update notes"
  ON entity_notes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN app_roles ar ON ar.id = p.role_id
      JOIN role_permissions rp ON rp.role_id = ar.id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'notes.update'
    )
  );

-- DELETE Policy: Users with notes.delete permission can delete notes
CREATE POLICY "Users can delete notes"
  ON entity_notes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      JOIN app_roles ar ON ar.id = p.role_id
      JOIN role_permissions rp ON rp.role_id = ar.id
      JOIN app_permissions ap ON ap.id = rp.permission_id
      WHERE p.id = auth.uid() AND ap.name = 'notes.delete'
    )
  );

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT ALL ON entity_notes TO authenticated;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE entity_notes IS 'Polymorphic notes for Residents and Houses with version history';
COMMENT ON COLUMN entity_notes.entity_type IS 'Target entity type: resident or house';
COMMENT ON COLUMN entity_notes.entity_id IS 'UUID of the target entity (resident.id or house.id)';
COMMENT ON COLUMN entity_notes.is_confidential IS 'If true, note is only visible to roles in confidential_roles';
COMMENT ON COLUMN entity_notes.confidential_roles IS 'Array of role names that can view this confidential note';
COMMENT ON COLUMN entity_notes.parent_note_id IS 'For versioning: points to the original note when editing';
COMMENT ON COLUMN entity_notes.is_current IS 'TRUE for the current version, FALSE for historical versions';
