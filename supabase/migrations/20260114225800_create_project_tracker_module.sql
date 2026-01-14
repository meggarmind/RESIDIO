-- Create Capital Project Tracker Module Tables
-- 20260114225800_create_project_tracker_module.sql

-- 1. Project Status Enum
CREATE TYPE public.project_status AS ENUM ('planning', 'active', 'completed', 'on_hold');
CREATE TYPE public.milestone_status AS ENUM ('pending', 'in_progress', 'completed');

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status public.project_status DEFAULT 'planning',
    start_date DATE,
    end_date DATE,
    total_budget DECIMAL(15, 2) DEFAULT 0 CHECK (total_budget >= 0),
    current_progress INTEGER DEFAULT 0 CHECK (current_progress >= 0 AND current_progress <= 100),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Project Milestones Table
CREATE TABLE IF NOT EXISTS public.project_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status public.milestone_status DEFAULT 'pending',
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Link Expenses to Projects
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'expenses' AND column_name = 'project_id'
    ) THEN
        ALTER TABLE public.expenses ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. RLS Policies
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

-- View Policies
CREATE POLICY "View Projects - Admins/EXCO" ON public.projects
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'project_manager') OR r.category = 'exco')
        )
    );

CREATE POLICY "View Milestones - Admins/EXCO" ON public.project_milestones
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'financial_secretary', 'project_manager') OR r.category = 'exco')
        )
    );

-- Manage Policies
CREATE POLICY "Manage Projects - Admins/Project Manager" ON public.projects
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'project_manager'))
        )
    );

CREATE POLICY "Manage Milestones - Admins/Project Manager" ON public.project_milestones
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.app_roles r ON p.role_id = r.id
            WHERE p.id = auth.uid() 
            AND (r.name IN ('super_admin', 'admin', 'project_manager'))
        )
    );

-- 6. Permissions Data
INSERT INTO public.app_permissions (name, category) VALUES 
('view_projects', 'projects'),
('manage_projects', 'projects')
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to roles
WITH role_ids AS (
    SELECT id, name FROM public.app_roles WHERE name IN ('super_admin', 'admin', 'financial_secretary', 'project_manager')
),
perm_ids AS (
    SELECT id, name FROM public.app_permissions WHERE name IN ('view_projects', 'manage_projects')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM role_ids r, perm_ids p
ON CONFLICT DO NOTHING;

-- 7. Triggers
CREATE TRIGGER set_updated_at_projects BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER set_updated_at_project_milestones BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
