-- Update vendors RLS policy to include chairman role
-- 20260119000102_fix_vendors_rls.sql

-- Drop the existing policy
DROP POLICY IF EXISTS "Manage Vendors - Admins/Financial Secretary" ON public.vendors;

-- Create updated policy that includes chairman
CREATE POLICY "Manage Vendors - Authorized Roles" ON public.vendors FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        JOIN public.app_roles r ON p.role_id = r.id 
        WHERE p.id = auth.uid() 
        AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer') OR r.category = 'exco')
    )
);
