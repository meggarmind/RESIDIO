-- Migration: Create resident_houses junction table
-- Links residents to houses with role and date information

CREATE TABLE public.resident_houses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    house_id UUID NOT NULL REFERENCES public.houses(id) ON DELETE CASCADE,

    -- Role within this specific house
    resident_role public.resident_role NOT NULL DEFAULT 'owner',

    -- Whether this is the resident's primary residence
    is_primary BOOLEAN NOT NULL DEFAULT true,

    -- Occupancy period
    move_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
    move_out_date DATE,

    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),

    -- Constraints
    CONSTRAINT resident_house_unique UNIQUE (resident_id, house_id),
    CONSTRAINT valid_date_range CHECK (move_out_date IS NULL OR move_out_date >= move_in_date)
);

-- Indexes
CREATE INDEX resident_houses_resident_idx ON public.resident_houses(resident_id);
CREATE INDEX resident_houses_house_idx ON public.resident_houses(house_id);
CREATE INDEX resident_houses_active_idx ON public.resident_houses(is_active) WHERE is_active = true;
CREATE INDEX resident_houses_primary_idx ON public.resident_houses(resident_id, is_primary) WHERE is_primary = true;

-- Enable RLS
ALTER TABLE public.resident_houses ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER resident_houses_updated_at
    BEFORE UPDATE ON public.resident_houses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies (follow same pattern as residents)
-- Admins, chairmen, and financial secretaries can view all
CREATE POLICY "Admins chairmen fin sec can view all resident houses"
    ON public.resident_houses
    FOR SELECT
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Security officers can view active resident houses
CREATE POLICY "Security officers can view active resident houses"
    ON public.resident_houses
    FOR SELECT
    USING (
        public.get_my_role() = 'security_officer'
        AND is_active = true
    );

-- Admins, chairmen, and financial secretaries can insert
CREATE POLICY "Admins chairmen fin sec can insert resident houses"
    ON public.resident_houses
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can update
CREATE POLICY "Admins chairmen fin sec can update resident houses"
    ON public.resident_houses
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can delete
CREATE POLICY "Admins chairmen fin sec can delete resident houses"
    ON public.resident_houses
    FOR DELETE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Grant permissions
GRANT ALL ON public.resident_houses TO authenticated;

-- Function to update house occupancy status based on active residents
CREATE OR REPLACE FUNCTION public.update_house_occupancy()
RETURNS TRIGGER AS $$
DECLARE
    target_house_id UUID;
BEGIN
    -- Determine which house to update
    IF TG_OP = 'DELETE' THEN
        target_house_id := OLD.house_id;
    ELSE
        target_house_id := NEW.house_id;
    END IF;

    -- Update the house's is_occupied status
    UPDATE public.houses
    SET is_occupied = EXISTS(
        SELECT 1 FROM public.resident_houses
        WHERE house_id = target_house_id
        AND is_active = true
    ),
    updated_at = NOW()
    WHERE id = target_house_id;

    -- Return appropriate row
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update house occupancy on changes
CREATE TRIGGER resident_houses_update_occupancy
    AFTER INSERT OR UPDATE OR DELETE ON public.resident_houses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_house_occupancy();
