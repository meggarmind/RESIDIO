-- Seed data for Phase 3 testing
-- Add streets, house types, and sample houses
-- Note: created_by is NULL since this runs during migrations before users are seeded

DO $$
DECLARE
    street_crescent UUID;
    street_palm UUID;
    street_garden UUID;
    street_sunrise UUID;
    type_detached UUID;
    type_semi UUID;
    type_terrace UUID;
    type_flat UUID;
    type_maisonette UUID;
BEGIN
    -- Insert Streets
    INSERT INTO public.streets (id, name, description) VALUES
        (gen_random_uuid(), 'Crescent Close', 'Main residential crescent with mature landscaping')
        RETURNING id INTO street_crescent;

    INSERT INTO public.streets (id, name, description) VALUES
        (gen_random_uuid(), 'Palm Avenue', 'Tree-lined avenue with palm trees')
        RETURNING id INTO street_palm;

    INSERT INTO public.streets (id, name, description) VALUES
        (gen_random_uuid(), 'Garden View', 'Properties overlooking the central garden')
        RETURNING id INTO street_garden;

    INSERT INTO public.streets (id, name, description) VALUES
        (gen_random_uuid(), 'Sunrise Lane', 'East-facing properties with morning sun')
        RETURNING id INTO street_sunrise;

    -- Insert House Types
    INSERT INTO public.house_types (id, name, description, max_residents) VALUES
        (gen_random_uuid(), 'Detached', '4-bedroom detached house with garden', 8)
        RETURNING id INTO type_detached;

    INSERT INTO public.house_types (id, name, description, max_residents) VALUES
        (gen_random_uuid(), 'Semi-Detached', '3-bedroom semi-detached house', 6)
        RETURNING id INTO type_semi;

    INSERT INTO public.house_types (id, name, description, max_residents) VALUES
        (gen_random_uuid(), 'Terrace', '3-bedroom terrace house', 6)
        RETURNING id INTO type_terrace;

    INSERT INTO public.house_types (id, name, description, max_residents) VALUES
        (gen_random_uuid(), 'Flat', '2-bedroom apartment unit', 4)
        RETURNING id INTO type_flat;

    INSERT INTO public.house_types (id, name, description, max_residents) VALUES
        (gen_random_uuid(), 'Maisonette', '2-bedroom maisonette over two floors', 4)
        RETURNING id INTO type_maisonette;

    -- Insert Sample Houses
    -- Crescent Close houses
    INSERT INTO public.houses (house_number, street_id, house_type_id) VALUES
        ('1', street_crescent, type_detached),
        ('2', street_crescent, type_detached),
        ('3', street_crescent, type_semi),
        ('4', street_crescent, type_semi),
        ('5', street_crescent, type_terrace);

    -- Palm Avenue houses
    INSERT INTO public.houses (house_number, street_id, house_type_id) VALUES
        ('10', street_palm, type_detached),
        ('12', street_palm, type_detached),
        ('14', street_palm, type_semi),
        ('16', street_palm, type_semi),
        ('18', street_palm, type_terrace);

    -- Garden View houses
    INSERT INTO public.houses (house_number, street_id, house_type_id) VALUES
        ('A1', street_garden, type_flat),
        ('A2', street_garden, type_flat),
        ('B1', street_garden, type_maisonette),
        ('B2', street_garden, type_maisonette);

    -- Sunrise Lane houses
    INSERT INTO public.houses (house_number, street_id, house_type_id) VALUES
        ('101', street_sunrise, type_terrace),
        ('102', street_sunrise, type_terrace),
        ('103', street_sunrise, type_terrace),
        ('104', street_sunrise, type_terrace);

END $$;
