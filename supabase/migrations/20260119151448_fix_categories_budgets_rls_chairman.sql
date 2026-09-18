-- Update Categories policy
DROP POLICY IF EXISTS "Manage Categories - Admins/Financial Secretary" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles" ON public.expense_categories FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        JOIN public.app_roles r ON p.role_id = r.id 
        WHERE p.id = auth.uid() 
        AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer') OR r.category = 'exco')
    )
);

-- Update Budgets policy
DROP POLICY IF EXISTS "Manage Budgets - Admins/Financial Secretary" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles" ON public.budgets FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.profiles p 
        JOIN public.app_roles r ON p.role_id = r.id 
        WHERE p.id = auth.uid() 
        AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'chairman', 'financial_officer') OR r.category = 'exco')
    )
);
