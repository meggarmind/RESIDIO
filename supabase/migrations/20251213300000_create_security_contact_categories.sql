-- Migration: Create Security Contact Categories Table
-- Stores configurable categories for security contacts (Domestic Staff, Service Provider, Visitor)

-- 1. Create security_contact_categories table
CREATE TABLE IF NOT EXISTS security_contact_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_validity_days INTEGER NOT NULL DEFAULT 30,
  max_validity_days INTEGER NOT NULL DEFAULT 365,
  requires_photo BOOLEAN NOT NULL DEFAULT false,
  requires_id_document BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add comments
COMMENT ON TABLE security_contact_categories IS 'Categories for security contacts (Domestic Staff, Service Provider, Visitor)';
COMMENT ON COLUMN security_contact_categories.name IS 'Display name of the category';
COMMENT ON COLUMN security_contact_categories.default_validity_days IS 'Default validity period when creating contacts in this category';
COMMENT ON COLUMN security_contact_categories.max_validity_days IS 'Maximum allowed validity period for contacts in this category';
COMMENT ON COLUMN security_contact_categories.requires_photo IS 'Whether photo is required for contacts in this category';
COMMENT ON COLUMN security_contact_categories.requires_id_document IS 'Whether ID document is required for contacts in this category';
COMMENT ON COLUMN security_contact_categories.sort_order IS 'Display order for the category';

-- 3. Enable RLS
ALTER TABLE security_contact_categories ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- All authenticated users can view active categories
CREATE POLICY "security_contact_categories_select_policy" ON security_contact_categories
  FOR SELECT TO authenticated
  USING (true);

-- Only admin can insert categories
CREATE POLICY "security_contact_categories_insert_policy" ON security_contact_categories
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() = 'admin');

-- Only admin can update categories
CREATE POLICY "security_contact_categories_update_policy" ON security_contact_categories
  FOR UPDATE TO authenticated
  USING (get_my_role() = 'admin');

-- Only admin can delete categories
CREATE POLICY "security_contact_categories_delete_policy" ON security_contact_categories
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- 5. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_security_contact_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER security_contact_categories_updated_at
  BEFORE UPDATE ON security_contact_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_security_contact_categories_updated_at();

-- 6. Insert default categories
INSERT INTO security_contact_categories (name, description, default_validity_days, max_validity_days, requires_photo, requires_id_document, sort_order) VALUES
  ('Domestic Staff', 'Live-in or daily household staff (housekeepers, drivers, nannies, cooks, gardeners, etc.)', 365, 365, false, false, 1),
  ('Service Provider', 'Regular service providers (artisans, technicians, cleaners, delivery personnel, etc.)', 30, 90, false, false, 2),
  ('Visitor', 'Pre-authorized visitors (family, friends, business associates, healthcare providers, etc.)', 1, 30, false, false, 3)
ON CONFLICT (name) DO NOTHING;

-- 7. Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_security_contact_categories_is_active ON security_contact_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_security_contact_categories_sort_order ON security_contact_categories(sort_order);
