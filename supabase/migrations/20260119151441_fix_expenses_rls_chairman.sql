-- Drop the existing policy
DROP POLICY IF EXISTS "Manage Expenditure - Admins/Financial Secretary" ON public.expenses;

-- Create updated policy that includes chairman and matches vendor policy logic
CREATE POLICY "Manage Expenditure - Authorized Roles" ON public.expenses FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        JOIN public.app_roles r ON p.role_id = r.id 
        WHERE p.id = auth.uid() 
        AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer') OR r.category = 'exco')
    )
);
