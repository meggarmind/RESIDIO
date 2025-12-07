-- Migration: Create function to generate unique 6-digit resident codes
-- Uses a retry loop to handle collisions

-- Function to generate a unique 6-digit numeric code
CREATE OR REPLACE FUNCTION public.generate_resident_code()
RETURNS CHAR(6) AS $$
DECLARE
    new_code CHAR(6);
    code_exists BOOLEAN;
    max_attempts INTEGER := 100;
    attempt INTEGER := 0;
BEGIN
    LOOP
        attempt := attempt + 1;

        -- Generate random 6-digit code (100000-999999)
        new_code := LPAD(FLOOR(RANDOM() * 900000 + 100000)::TEXT, 6, '0');

        -- Check if code already exists
        SELECT EXISTS(
            SELECT 1 FROM public.residents WHERE resident_code = new_code
        ) INTO code_exists;

        -- Exit loop if code is unique
        EXIT WHEN NOT code_exists;

        -- Safety check to prevent infinite loop
        IF attempt >= max_attempts THEN
            RAISE EXCEPTION 'Could not generate unique resident code after % attempts', max_attempts;
        END IF;
    END LOOP;

    RETURN new_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Create trigger function to auto-generate code on insert
CREATE OR REPLACE FUNCTION public.set_resident_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.resident_code IS NULL OR NEW.resident_code = '' OR NEW.resident_code = '000000' THEN
        NEW.resident_code := public.generate_resident_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on residents table
CREATE TRIGGER residents_set_code
    BEFORE INSERT ON public.residents
    FOR EACH ROW
    EXECUTE FUNCTION public.set_resident_code();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.generate_resident_code() TO authenticated;
