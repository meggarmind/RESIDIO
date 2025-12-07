-- Migration: Create streets table
-- Streets are the primary address grouping in the estate

CREATE TABLE public.streets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX streets_name_idx ON public.streets(name);
CREATE INDEX streets_active_idx ON public.streets(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.streets ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER streets_updated_at
    BEFORE UPDATE ON public.streets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- All authenticated users can view active streets
CREATE POLICY "All authenticated users can view active streets"
    ON public.streets
    FOR SELECT
    USING (is_active = true OR public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can insert streets
CREATE POLICY "Admins and chairmen can insert streets"
    ON public.streets
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can update streets
CREATE POLICY "Admins and chairmen can update streets"
    ON public.streets
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman'));

-- Admins and chairmen can delete streets
CREATE POLICY "Admins and chairmen can delete streets"
    ON public.streets
    FOR DELETE
    USING (public.get_my_role() IN ('admin', 'chairman'));

-- Grant permissions
GRANT ALL ON public.streets TO authenticated;
