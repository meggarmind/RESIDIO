-- Migration: Migrate Legacy Notes Data
-- Converts existing notes TEXT fields on residents and houses to entity_notes records

-- ============================================================================
-- MIGRATE RESIDENTS NOTES
-- ============================================================================

-- Get a fallback admin user for created_by (first super_admin found)
DO $$
DECLARE
  fallback_admin_id UUID;
BEGIN
  -- Get a fallback admin for records without created_by
  SELECT p.id INTO fallback_admin_id
  FROM profiles p
  JOIN app_roles ar ON ar.id = p.role_id
  WHERE ar.name = 'super_admin'
  LIMIT 1;

  -- Migrate resident notes
  INSERT INTO entity_notes (
    entity_type,
    entity_id,
    title,
    content,
    category,
    is_confidential,
    created_by,
    created_at
  )
  SELECT
    'resident'::note_entity_type,
    r.id,
    'Legacy Note', -- Default title for migrated notes
    r.notes,
    'general'::note_category,
    FALSE,
    COALESCE(r.created_by, fallback_admin_id),
    r.created_at
  FROM residents r
  WHERE r.notes IS NOT NULL
    AND TRIM(r.notes) != ''
    AND fallback_admin_id IS NOT NULL;

  -- Log migration count for residents
  RAISE NOTICE 'Migrated % resident notes', (
    SELECT COUNT(*)
    FROM residents
    WHERE notes IS NOT NULL AND TRIM(notes) != ''
  );

  -- Migrate house notes
  INSERT INTO entity_notes (
    entity_type,
    entity_id,
    title,
    content,
    category,
    is_confidential,
    created_by,
    created_at
  )
  SELECT
    'house'::note_entity_type,
    h.id,
    'Legacy Note', -- Default title for migrated notes
    h.notes,
    'general'::note_category,
    FALSE,
    COALESCE(h.created_by, fallback_admin_id),
    h.created_at
  FROM houses h
  WHERE h.notes IS NOT NULL
    AND TRIM(h.notes) != ''
    AND fallback_admin_id IS NOT NULL;

  -- Log migration count for houses
  RAISE NOTICE 'Migrated % house notes', (
    SELECT COUNT(*)
    FROM houses
    WHERE notes IS NOT NULL AND TRIM(notes) != ''
  );

END $$;

-- ============================================================================
-- ADD DEPRECATION COMMENTS
-- ============================================================================

-- Mark the old notes columns as deprecated
COMMENT ON COLUMN residents.notes IS 'DEPRECATED: Use entity_notes table instead. This field is retained for backward compatibility.';
COMMENT ON COLUMN houses.notes IS 'DEPRECATED: Use entity_notes table instead. This field is retained for backward compatibility.';

-- Note: We intentionally do NOT drop the old columns yet.
-- A future migration can remove them after verifying the new system works correctly.
-- Example future migration:
-- ALTER TABLE residents DROP COLUMN notes;
-- ALTER TABLE houses DROP COLUMN notes;
