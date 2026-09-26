
-- DEV-69: Data Cleanup & Initial Role Assignment
-- This migration cleans up fictitious test user data and adjusts system role flags

-- 1. Remove fictitious test profiles (chairman, finance, security)
-- Note: These profiles have no resident_id, meaning they're not linked to real residents
-- We keep admin@residio.test as the system administrator account

-- First, log the cleanup in audit_logs before deleting
INSERT INTO audit_logs (action, entity_type, entity_id, entity_display, old_values, description, actor_id)
SELECT 
  'DELETE',
  'profiles',
  p.id,
  p.email,
  jsonb_build_object(
    'email', p.email,
    'full_name', p.full_name,
    'role_id', p.role_id,
    'resident_id', p.resident_id
  ),
  'Data cleanup: Removed fictitious test account created during development',
  (SELECT id FROM profiles WHERE email = 'admin@residio.test' LIMIT 1)
FROM profiles p
WHERE p.email IN ('chairman@residio.test', 'finance@residio.test', 'security@residio.test');

-- Delete the fictitious profiles
DELETE FROM profiles 
WHERE email IN ('chairman@residio.test', 'finance@residio.test', 'security@residio.test');

-- 2. Update chairman role to not be a system role
-- Per DEV-69: Only super_admin and resident should be system roles
-- Chairman should be assignable/removable like other admin roles

-- Log the change
INSERT INTO audit_logs (action, entity_type, entity_id, entity_display, old_values, new_values, description, actor_id)
SELECT 
  'UPDATE',
  'app_roles',
  id,
  display_name,
  jsonb_build_object('is_system_role', true),
  jsonb_build_object('is_system_role', false),
  'Data cleanup: Changed chairman to non-system role for flexible assignment',
  (SELECT id FROM profiles WHERE email = 'admin@residio.test' LIMIT 1)
FROM app_roles
WHERE name = 'chairman' AND is_system_role = true;

-- Update the role
UPDATE app_roles 
SET is_system_role = false 
WHERE name = 'chairman';

-- 3. Verify final state with a comment
-- After this migration:
-- - Only admin@residio.test remains as Super Administrator
-- - Chairman role is now assignable via the Roles UI
-- - Feyijimi Adewole can be assigned Chairman role once they create an account
