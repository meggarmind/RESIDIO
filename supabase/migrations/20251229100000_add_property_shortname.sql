-- Migration: Add property shortname system
-- Adds short_name to streets (if not exists) and houses tables
-- Auto-generates house shortname from street code + house number

-- Add short_name to streets table if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'streets'
        AND column_name = 'short_name'
    ) THEN
        ALTER TABLE public.streets ADD COLUMN short_name TEXT;

        -- Add unique constraint for short_name (when not null)
        CREATE UNIQUE INDEX streets_short_name_unique
            ON public.streets(short_name)
            WHERE short_name IS NOT NULL;
    END IF;
END $$;

-- Add short_name to houses table
ALTER TABLE public.houses
    ADD COLUMN IF NOT EXISTS short_name TEXT;

-- Create unique index for house short_name (when not null)
CREATE UNIQUE INDEX IF NOT EXISTS houses_short_name_unique
    ON public.houses(short_name)
    WHERE short_name IS NOT NULL;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS houses_short_name_idx ON public.houses(short_name);

-- Function to generate house shortname from street short_name and house_number
CREATE OR REPLACE FUNCTION public.generate_house_shortname(
    p_street_id UUID,
    p_house_number TEXT
) RETURNS TEXT AS $$
DECLARE
    v_street_code TEXT;
    v_shortname TEXT;
BEGIN
    -- Get street short_name
    SELECT short_name INTO v_street_code
    FROM public.streets
    WHERE id = p_street_id;

    -- If street has no short_name, return NULL (shortname is optional)
    IF v_street_code IS NULL THEN
        RETURN NULL;
    END IF;

    -- Generate shortname as: STREET_CODE-HOUSE_NUMBER
    -- Example: OAK-10A, ELM-5B
    v_shortname := UPPER(v_street_code) || '-' || UPPER(p_house_number);

    RETURN v_shortname;
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to auto-generate shortname on house insert/update if not provided
CREATE OR REPLACE FUNCTION public.handle_house_shortname()
RETURNS TRIGGER AS $$
DECLARE
    v_generated_shortname TEXT;
BEGIN
    -- Only auto-generate if short_name is not explicitly provided
    IF NEW.short_name IS NULL THEN
        v_generated_shortname := public.generate_house_shortname(NEW.street_id, NEW.house_number);
        NEW.short_name := v_generated_shortname;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating shortname
DROP TRIGGER IF EXISTS house_shortname_trigger ON public.houses;
CREATE TRIGGER house_shortname_trigger
    BEFORE INSERT OR UPDATE OF street_id, house_number
    ON public.houses
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_house_shortname();

-- Backfill existing houses with shortnames
UPDATE public.houses h
SET short_name = public.generate_house_shortname(h.street_id, h.house_number)
WHERE h.short_name IS NULL;

-- Comment on columns
COMMENT ON COLUMN public.streets.short_name IS 'Short code for street (e.g., OAK for Oak Avenue). Used in property shortnames.';
COMMENT ON COLUMN public.houses.short_name IS 'Human-readable property identifier (e.g., OAK-10A). Auto-generated from street code + house number.';
