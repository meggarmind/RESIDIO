-- Update vendors RLS policy to include chairman role
-- 20260119000102_fix_vendors_rls.sql

-- Drop the superseded policy.
DROP POLICY IF EXISTS "Manage Vendors - Admins/Financial Secretary" ON public.vendors;

-- Also drop the policy this migration is about to create. CREATE POLICY has no
-- IF NOT EXISTS, so without this line a re-run (or a database rebuilt from
-- migrations against a schema where the policy already exists) aborts with
--   42710: policy "Manage Vendors - Authorized Roles" for table "vendors" already exists
-- Dropping and recreating inside the migration's transaction is atomic, so the
-- table is never briefly left without the policy.
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;

-- Create updated policy that includes chairman
CREATE POLICY "Manage Vendors - Authorized Roles" ON public.vendors FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        JOIN public.app_roles r ON p.role_id = r.id 
        WHERE p.id = auth.uid() 
        AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer') OR r.category = 'exco')
    )
);
