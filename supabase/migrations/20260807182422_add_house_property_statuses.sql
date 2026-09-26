DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'property_status') THEN
    CREATE TYPE public.property_status AS ENUM (
      'occupied',
      'vacant',
      'under_renovation',
      'under_construction'
    );
  END IF;
END $$;

ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS property_status public.property_status NOT NULL DEFAULT 'occupied';

UPDATE public.houses
SET property_status = CASE
  WHEN is_occupied THEN 'occupied'::public.property_status
  ELSE 'vacant'::public.property_status
END
WHERE property_status = 'occupied'::public.property_status;

INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('bill_under_renovation_houses', 'false'::jsonb, 'Bill non-resident landlords for houses under renovation', 'billing'),
  ('bill_under_construction_houses', 'false'::jsonb, 'Bill non-resident landlords for houses under construction', 'billing')
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.houses.property_status IS 'Operational property state used by occupancy and billing rules';
