-- Create Expenditure Module Tables
-- 20260114225000_create_expenditure_module.sql

-- 1. Expense Categories
CREATE TABLE IF NOT EXISTS public.expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Vendors
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    category TEXT,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    bank_details JSONB DEFAULT '{}'::jsonb, -- {bank_name, account_number, account_name}
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Expenses
CREATE TYPE public.expense_status AS ENUM ('pending', 'paid', 'cancelled');

CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE SET NULL,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount >= 0),
    description TEXT,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status public.expense_status DEFAULT 'pending',
    receipt_url TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Budgets
CREATE TABLE IF NOT EXISTS public.budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES public.expense_categories(id) ON DELETE CASCADE,
    amount DECIMAL(15, 2) NOT NULL CHECK (amount >= 0),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT valid_period CHECK (period_end >= period_start)
);

-- 5. RLS Policies
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

-- Default access: Admins and Financial Secretary can view/manage
-- Note: Assuming presence of public.profiles(role_id) and RBAC system

-- View Policies
CREATE POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'financial_secretary') OR r.category = 'exco')
        )
    );

-- Similar policies for others...
CREATE POLICY "View Vendors - Admins/Financial Secretary" ON public.vendors FOR SELECT USING (true); -- Public view for internal use
CREATE POLICY "View Categories - Admins/Financial Secretary" ON public.expense_categories FOR SELECT USING (true);
CREATE POLICY "View Budgets - Admins/Financial Secretary" ON public.budgets FOR SELECT USING (true);

-- Manage Policies
CREATE POLICY "Manage Expenditure - Admins/Financial Secretary" ON public.expenses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'financial_secretary'))
        )
    );

CREATE POLICY "Manage Vendors - Admins/Financial Secretary" ON public.vendors FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p JOIN public.app_roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.name IN ('super_admin', 'admin', 'financial_secretary'))
);

CREATE POLICY "Manage Categories - Admins/Financial Secretary" ON public.expense_categories FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p JOIN public.app_roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.name IN ('super_admin', 'admin', 'financial_secretary'))
);

CREATE POLICY "Manage Budgets - Admins/Financial Secretary" ON public.budgets FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p JOIN public.app_roles r ON p.role_id = r.id WHERE p.id = auth.uid() AND r.name IN ('super_admin', 'admin', 'financial_secretary'))
);

-- 6. Permissions Data
INSERT INTO public.app_permissions (name, category) VALUES 
('view_expenditure', 'finance'),
('manage_expenditure', 'finance'),
('view_vendors', 'finance'),
('manage_vendors', 'finance')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
WITH role_ids AS (
    SELECT id, name FROM public.app_roles WHERE name IN ('super_admin', 'admin', 'financial_secretary')
),
perm_ids AS (
    SELECT id, name FROM public.app_permissions WHERE name IN ('view_expenditure', 'manage_expenditure', 'view_vendors', 'manage_vendors')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_ids r, perm_ids p
ON CONFLICT DO NOTHING;

-- 7. Audit Logging Triggers (if system supports it)
-- Assuming handle_updated_at function exists from previous migrations
CREATE TRIGGER set_updated_at_expense_categories BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_vendors BEFORE UPDATE ON public.vendors FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_expenses BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_budgets BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
