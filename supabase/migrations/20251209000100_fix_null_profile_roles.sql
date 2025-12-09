-- Migration: Fix NULL roles in profiles
-- Updates any profiles with NULL role to have a default role

BEGIN;

-- Update any profiles with NULL role to 'admin' (first user is typically admin)
-- You can change this to 'security_officer' or another role as needed
UPDATE public.profiles
SET role = 'admin'
WHERE role IS NULL;

-- Ensure role column cannot be NULL going forward
ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'security_officer',
ALTER COLUMN role SET NOT NULL;

COMMIT;
