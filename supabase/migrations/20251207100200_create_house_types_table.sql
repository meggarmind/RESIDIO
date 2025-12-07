-- Migration: Create house_types table
-- Defines types of properties (e.g., Detached, Semi-detached, Flat)

CREATE TABLE public.house_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    max_residents INTEGER NOT NULL DEFAULT 10,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX house_types_name_idx ON public.house_types(name);
CREATE INDEX house_types_active_idx ON public.house_types(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.house_types ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER house_types_updated_at
    BEFORE UPDATE ON public.house_types
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- All authenticated users can view active house types
CREATE POLICY "All authenticated users can view active house types"
    ON public.house_types
    FOR SELECT
    USING (is_active = true OR public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can insert house types
CREATE POLICY "Admins and chairmen can insert house types"
    ON public.house_types
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can update house types
CREATE POLICY "Admins and chairmen can update house types"
    ON public.house_types
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can delete house types
CREATE POLICY "Admins and chairmen can delete house types"
    ON public.house_types
    FOR DELETE
    USING (public.get_my_role() IN ('admin', 'chairman'));

-- Grant permissions
GRANT ALL ON public.house_types TO authenticated;
