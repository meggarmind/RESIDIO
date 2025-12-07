-- Migration: Create houses table
-- Represents individual properties in the estate

CREATE TABLE public.houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    house_number TEXT NOT NULL,
    street_id UUID NOT NULL REFERENCES public.streets(id) ON DELETE RESTRICT,
    house_type_id UUID REFERENCES public.house_types(id) ON DELETE SET NULL,
    address_line_2 TEXT,
    is_occupied BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),

    -- Unique constraint: house number + street combination
    CONSTRAINT houses_number_street_unique UNIQUE (house_number, street_id)
);

-- Indexes
CREATE INDEX houses_street_idx ON public.houses(street_id);
CREATE INDEX houses_type_idx ON public.houses(house_type_id);
CREATE INDEX houses_occupied_idx ON public.houses(is_occupied);
CREATE INDEX houses_active_idx ON public.houses(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.houses ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER houses_updated_at
    BEFORE UPDATE ON public.houses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- All authenticated users can view active houses
CREATE POLICY "All authenticated users can view active houses"
    ON public.houses
    FOR SELECT
    USING (is_active = true OR public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can insert houses
CREATE POLICY "Admins chairmen and fin sec can insert houses"
    ON public.houses
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can update houses
CREATE POLICY "Admins chairmen and fin sec can update houses"
    ON public.houses
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can delete houses
CREATE POLICY "Admins chairmen and fin sec can delete houses"
    ON public.houses
    FOR DELETE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Grant permissions
GRANT ALL ON public.houses TO authenticated;
