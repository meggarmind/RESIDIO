-- Seed Default Expense Categories
-- 20260114225500_seed_expense_categories.sql

INSERT INTO public.expense_categories (name, description) VALUES
('Security', 'Estate security services, guards, and equipment'),
('Wait Management', 'Waste collection and disposal services'),
('Electricity', 'Power bills for common areas and streetlights'),
('Water', 'Water supply and maintenance'),
('Generator/Fuel', 'Diesel and maintenance for estate generators'),
('Staff Salaries', 'Wages for estate administrative and maintenance staff'),
('Repairs & Maintenance', 'General repairs to estate infrastructure'),
('Administrative', 'Office supplies, software, and communication'),
('Legal & Professional', 'Legal fees and professional consultations'),
('Landscaping', 'Gardening and common area beautification')
ON CONFLICT (name) DO NOTHING;
