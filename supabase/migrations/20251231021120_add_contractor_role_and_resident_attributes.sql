
-- =====================================================
-- Migration: Add Contractor Role and Resident Attributes
-- =====================================================
-- This migration:
-- 1. Adds 'contractor' to the resident_role enum
-- 2. Adds is_live_in column to resident_houses (for domestic staff)
-- 3. Adds tags column to resident_houses (for flexible attributes)
-- =====================================================

-- 1. Add 'contractor' to resident_role enum
ALTER TYPE resident_role ADD VALUE IF NOT EXISTS 'contractor';

-- 2. Add is_live_in column for domestic staff designation
-- This helps distinguish live-in domestic staff from visiting domestic staff
ALTER TABLE resident_houses 
ADD COLUMN IF NOT EXISTS is_live_in BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN resident_houses.is_live_in IS 
'For domestic_staff role: TRUE = live-in staff (resides at property), FALSE = visiting staff (works at property but lives elsewhere)';

-- 3. Add tags column for flexible attributes/tags system
-- This allows tagging residents with custom attributes without schema changes
ALTER TABLE resident_houses 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN resident_houses.tags IS 
'Flexible tags/attributes for the resident-house relationship. Examples: elderly, disabled, parking_permit, pool_access, etc.';

-- 4. Add is_primary column if it doesn't exist (was in TypeScript but not DB)
ALTER TABLE resident_houses 
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN resident_houses.is_primary IS 
'Indicates if this is the primary residence for the resident (for One Home policy enforcement)';

-- 5. Create index on tags for efficient queries
CREATE INDEX IF NOT EXISTS idx_resident_houses_tags ON resident_houses USING GIN (tags);

-- 6. Create index on is_live_in for filtering
CREATE INDEX IF NOT EXISTS idx_resident_houses_is_live_in ON resident_houses (is_live_in) WHERE is_live_in = TRUE;
