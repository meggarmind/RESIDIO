-- Migration: Add Security Settings to System Settings
-- Adds configurable security module settings for role permissions and configuration

-- 1. Insert default security settings
INSERT INTO system_settings (key, value, description, category) VALUES
  -- Role permissions - which roles can perform which actions
  ('security_role_permissions', '{
    "register_contacts": ["admin", "chairman", "financial_secretary"],
    "generate_codes": ["admin", "chairman", "financial_secretary"],
    "update_contacts": ["admin", "chairman", "financial_secretary"],
    "verify_codes": ["admin", "chairman", "financial_secretary", "security_officer"],
    "record_checkin": ["admin", "chairman", "financial_secretary", "security_officer"],
    "view_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
    "search_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
    "export_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
    "suspend_revoke_contacts": ["admin", "chairman"],
    "configure_categories": ["admin"],
    "view_access_logs": ["admin", "chairman"]
  }'::jsonb, 'Role permissions for security module features', 'security'),

  -- Contact configuration
  ('security_max_contacts_per_resident', 'null'::jsonb, 'Maximum number of security contacts per resident (null for unlimited)', 'security'),

  -- Mandatory fields configuration
  ('security_mandatory_fields', '["full_name", "phone_primary", "category_id"]'::jsonb, 'Required fields when creating security contacts', 'security'),

  -- Access code configuration
  ('security_code_format', '"alphanumeric"'::jsonb, 'Format for access codes: alphanumeric or numeric', 'security'),

  -- Expiry notification settings
  ('security_expiry_warning_days', '[7, 3, 1]'::jsonb, 'Days before expiry to show warnings', 'security'),

  -- Auto-expire contacts when validity ends
  ('security_auto_expire_contacts', 'true'::jsonb, 'Automatically set contact status to expired when validity ends', 'security')

ON CONFLICT (key) DO NOTHING;

-- 2. Create a view for easy access to security settings with defaults
CREATE OR REPLACE VIEW security_settings_view AS
SELECT
  key,
  CASE key
    WHEN 'security_role_permissions' THEN COALESCE(value, '{
      "register_contacts": ["admin", "chairman", "financial_secretary"],
      "generate_codes": ["admin", "chairman", "financial_secretary"],
      "update_contacts": ["admin", "chairman", "financial_secretary"],
      "verify_codes": ["admin", "chairman", "financial_secretary", "security_officer"],
      "record_checkin": ["admin", "chairman", "financial_secretary", "security_officer"],
      "view_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "search_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "export_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "suspend_revoke_contacts": ["admin", "chairman"],
      "configure_categories": ["admin"],
      "view_access_logs": ["admin", "chairman"]
    }'::jsonb)
    WHEN 'security_max_contacts_per_resident' THEN COALESCE(value, 'null'::jsonb)
    WHEN 'security_mandatory_fields' THEN COALESCE(value, '["full_name", "phone_primary", "category_id"]'::jsonb)
    WHEN 'security_code_format' THEN COALESCE(value, '"alphanumeric"'::jsonb)
    WHEN 'security_expiry_warning_days' THEN COALESCE(value, '[7, 3, 1]'::jsonb)
    WHEN 'security_auto_expire_contacts' THEN COALESCE(value, 'true'::jsonb)
    ELSE value
  END as value,
  description,
  updated_at
FROM system_settings
WHERE category = 'security';

-- 3. Grant access to the view
GRANT SELECT ON security_settings_view TO authenticated;

-- 4. Function to check if current user has a security permission
CREATE OR REPLACE FUNCTION has_security_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  permissions JSONB;
  role_list JSONB;
BEGIN
  -- Get current user's role
  user_role := get_my_role();

  -- Admin always has all permissions
  IF user_role = 'admin' THEN
    RETURN true;
  END IF;

  -- Get permissions from settings
  SELECT value INTO permissions
  FROM system_settings
  WHERE key = 'security_role_permissions';

  -- If no permissions found, use defaults
  IF permissions IS NULL THEN
    permissions := '{
      "register_contacts": ["admin", "chairman", "financial_secretary"],
      "generate_codes": ["admin", "chairman", "financial_secretary"],
      "update_contacts": ["admin", "chairman", "financial_secretary"],
      "verify_codes": ["admin", "chairman", "financial_secretary", "security_officer"],
      "record_checkin": ["admin", "chairman", "financial_secretary", "security_officer"],
      "view_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "search_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "export_contacts": ["admin", "chairman", "financial_secretary", "security_officer"],
      "suspend_revoke_contacts": ["admin", "chairman"],
      "configure_categories": ["admin"],
      "view_access_logs": ["admin", "chairman"]
    }'::jsonb;
  END IF;

  -- Get the role list for this permission
  role_list := permissions->permission_name;

  -- Check if user's role is in the list
  IF role_list IS NOT NULL THEN
    RETURN role_list ? user_role;
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION has_security_permission(TEXT) TO authenticated;
