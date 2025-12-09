-- Migration: Create profiles table with RLS policies
-- Description: User profiles linked to Supabase Auth with role-based access control

-- Create custom types for user roles
CREATE TYPE public.user_role AS ENUM ('chairman', 'financial_secretary', 'security_officer', 'admin');

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role public.user_role NOT NULL DEFAULT 'security_officer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX profiles_email_idx ON public.profiles(email);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Policy: Admins and chairmen can view all profiles
CREATE POLICY "Admins and chairmen can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'chairman')
        )
    );

-- Policy: Users can update their own profile (except role)
CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- Policy: Only admins can insert new profiles (besides the trigger)
CREATE POLICY "Admins can insert profiles"
    ON public.profiles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Policy: Only admins can delete profiles
CREATE POLICY "Admins can delete profiles"
    ON public.profiles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role = 'admin'
        )
    );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'security_officer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON public.profiles TO authenticated;
GRANT USAGE ON TYPE public.user_role TO authenticated;
-- Migration: Fix RLS recursion issue in profiles table
-- Problem: The admin/chairman policies query profiles table recursively, causing RLS checks to fail
-- Solution: Use SECURITY DEFINER function to bypass RLS when checking user's own role

-- Create helper function to get current user's role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Drop the problematic recursive policies
DROP POLICY IF EXISTS "Admins and chairmen can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON public.profiles;

-- Recreate policies using the non-recursive function
CREATE POLICY "Admins and chairmen can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (public.get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "Admins can insert profiles"
    ON public.profiles
    FOR INSERT
    WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admins can delete profiles"
    ON public.profiles
    FOR DELETE
    USING (public.get_my_role() = 'admin');
-- Migration: Create resident-related ENUM types
-- These must be created before tables that reference them

-- Resident type: primary (household head) or secondary (other household members)
CREATE TYPE public.resident_type AS ENUM ('primary', 'secondary');

-- Resident role: relationship to the property
CREATE TYPE public.resident_role AS ENUM ('owner', 'tenant', 'occupier', 'domestic_staff');

-- Verification status for resident identity/KYC
CREATE TYPE public.verification_status AS ENUM ('pending', 'submitted', 'verified', 'rejected');

-- Account status for resident access control
CREATE TYPE public.account_status AS ENUM ('active', 'inactive', 'suspended', 'archived');

-- Grant usage on ENUMs to authenticated users
GRANT USAGE ON TYPE public.resident_type TO authenticated;
GRANT USAGE ON TYPE public.resident_role TO authenticated;
GRANT USAGE ON TYPE public.verification_status TO authenticated;
GRANT USAGE ON TYPE public.account_status TO authenticated;
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
-- Migration: Create residents table
-- Core resident entity - individuals living in the estate

CREATE TABLE public.residents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 6-digit unique code for quick identification (auto-generated)
    resident_code CHAR(6) NOT NULL UNIQUE,

    -- Personal information
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    phone_primary TEXT NOT NULL,
    phone_secondary TEXT,

    -- Resident classification
    resident_type public.resident_type NOT NULL DEFAULT 'primary',

    -- Status fields
    verification_status public.verification_status NOT NULL DEFAULT 'pending',
    account_status public.account_status NOT NULL DEFAULT 'active',

    -- Identity verification (optional, for future KYC)
    id_type TEXT,
    id_number TEXT,
    id_verified_at TIMESTAMPTZ,
    id_verified_by UUID REFERENCES public.profiles(id),

    -- Photo (URL to stored image)
    photo_url TEXT,

    -- Emergency contact
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    emergency_contact_relationship TEXT,

    -- Additional info
    notes TEXT,

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),
    updated_by UUID REFERENCES public.profiles(id)
);

-- Indexes
CREATE INDEX residents_code_idx ON public.residents(resident_code);
CREATE INDEX residents_name_idx ON public.residents(last_name, first_name);
CREATE INDEX residents_email_idx ON public.residents(email) WHERE email IS NOT NULL;
CREATE INDEX residents_phone_idx ON public.residents(phone_primary);
CREATE INDEX residents_status_idx ON public.residents(account_status);
CREATE INDEX residents_verification_idx ON public.residents(verification_status);
CREATE INDEX residents_type_idx ON public.residents(resident_type);

-- Enable RLS
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at
CREATE TRIGGER residents_updated_at
    BEFORE UPDATE ON public.residents
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS Policies
-- Admins, chairmen, and financial secretaries can view all residents
CREATE POLICY "Admins chairmen fin sec can view all residents"
    ON public.residents
    FOR SELECT
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Security officers can only view active residents
CREATE POLICY "Security officers can view active residents"
    ON public.residents
    FOR SELECT
    USING (
        public.get_my_role() = 'security_officer'
        AND account_status = 'active'
    );

-- Admins, chairmen, and financial secretaries can insert residents
CREATE POLICY "Admins chairmen fin sec can insert residents"
    ON public.residents
    FOR INSERT
    WITH CHECK (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Admins, chairmen, and financial secretaries can update residents
CREATE POLICY "Admins chairmen fin sec can update residents"
    ON public.residents
    FOR UPDATE
    USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Only admins can delete residents
CREATE POLICY "Only admins can delete residents"
    ON public.residents
    FOR DELETE
    USING (public.get_my_role() = 'admin');

-- Grant permissions
GRANT ALL ON public.residents TO authenticated;
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
-- Migration: Update resident_role enum and add emergency contact FK

-- 1. Update resident_role enum
-- We can't directly rename enum values in Postgres easily without recreating the type or hacky updates.
-- Since this is early dev, we'll append the new value 'family_member'. 
-- NOTE: We are keeping 'occupier' to avoid breaking existing data/code until a data migration script is run, 
-- but we will update the UI to use 'family_member'. 
-- Alternatively, if we are sure no 'occupier' data exists or we don't care, we can rename.
-- Given Phase 3 is "fresh", let's attempt to ADD the new value.
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'family_member';

-- 2. Add emergency_contact_resident_id to residents table
ALTER TABLE public.residents 
ADD COLUMN IF NOT EXISTS emergency_contact_resident_id UUID REFERENCES public.residents(id);

-- 3. Add constraint to prevent self-reference
ALTER TABLE public.residents
ADD CONSTRAINT residents_emergency_contact_check 
CHECK (emergency_contact_resident_id != id);

-- 4. Create index for the new FK
CREATE INDEX IF NOT EXISTS idx_residents_emergency_contact ON public.residents(emergency_contact_resident_id);
-- Migration: Secure Primary Residence Uniqueness
-- Ensures a resident can only have one 'is_primary=true' record in resident_houses.
-- This prevents data inconsistencies where a user accidentally has two primary homes.

-- 1. Create a unique partial index
-- This will fail if bad data already exists, which is good (we want to know).
CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_residence 
ON public.resident_houses (resident_id) 
WHERE is_primary = true AND is_active = true;

-- Note: We include `AND is_active = true` because historical/inactive records shouldn't block a current primary residence.
-- Migration: Create Payment Records

-- 1. Create Enums
BEGIN;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'overdue', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('cash', 'bank_transfer', 'pos', 'cheque');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Add profile_id to residents (needed for RLS)
ALTER TABLE public.residents ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id);
CREATE INDEX IF NOT EXISTS idx_residents_profile_id ON public.residents(profile_id);

-- 3. Create payment_records table
CREATE TABLE IF NOT EXISTS payment_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    period_start DATE,
    period_end DATE,
    status payment_status NOT NULL DEFAULT 'pending',
    method payment_method,
    reference_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_payment_records_resident ON payment_records(resident_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_status ON payment_records(status);
CREATE INDEX IF NOT EXISTS idx_payment_records_date ON payment_records(payment_date);

-- 4. Enable RLS
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Admins/Chairman/FinSec can view/manage ALL payments
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments" ON payment_records;
CREATE POLICY "Admins and FinSec can manage all payments" ON payment_records
    FOR ALL
    USING (
        auth.uid() IN (
            SELECT id FROM profiles 
            WHERE role IN ('admin', 'chairman', 'financial_secretary')
        )
    );

-- Residents can view their OWN payments
DROP POLICY IF EXISTS "Residents can view own payments" ON payment_records;
CREATE POLICY "Residents can view own payments" ON payment_records
    FOR SELECT
    USING (
        resident_id IN (
            SELECT id FROM residents WHERE profile_id = auth.uid()
        )
    );

-- 6. Trigger for updated_at
DROP TRIGGER IF EXISTS update_payment_records_modtime ON payment_records;
CREATE TRIGGER update_payment_records_modtime
    BEFORE UPDATE ON payment_records
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

COMMIT;
-- Migration: Create Billing Schema
-- Establishes Billing Profiles, Billing Items, and Invoices

BEGIN;

-- 1. Create billing_profiles table (Rate Cards)
CREATE TABLE IF NOT EXISTS public.billing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id)
);

-- RLS for billing_profiles
ALTER TABLE public.billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "All authenticated can view billing profiles" ON public.billing_profiles
    FOR SELECT USING (true); -- Publicly viewable for transparency/debugging, or restrict if needed

-- Trigger for billing_profiles updated_at
CREATE TRIGGER billing_profiles_updated_at
    BEFORE UPDATE ON public.billing_profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 2. Create billing_items table (Line items for a profile)
CREATE TYPE public.billing_frequency AS ENUM ('monthly', 'yearly', 'one_off');

CREATE TABLE IF NOT EXISTS public.billing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_profile_id UUID NOT NULL REFERENCES public.billing_profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- e.g. "Security Fee"
    amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
    frequency public.billing_frequency NOT NULL DEFAULT 'monthly',
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for billing_items
ALTER TABLE public.billing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "All authenticated can view billing items" ON public.billing_items
    FOR SELECT USING (true);

-- Trigger for billing_items updated_at
CREATE TRIGGER billing_items_updated_at
    BEFORE UPDATE ON public.billing_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. Update house_types to link to billing_profiles
ALTER TABLE public.house_types
ADD COLUMN IF NOT EXISTS billing_profile_id UUID REFERENCES public.billing_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_house_types_billing_profile ON public.house_types(billing_profile_id);


-- 4. Create invoices table
CREATE TYPE public.invoice_status AS ENUM ('unpaid', 'paid', 'void', 'partially_paid');

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
    house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL, -- Context: which house was this billed for?
    billing_profile_id UUID REFERENCES public.billing_profiles(id), -- Snapshot: which profile was used?
    
    invoice_number TEXT NOT NULL UNIQUE, -- e.g. INV-2025-0001
    amount_due DECIMAL(12, 2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status public.invoice_status NOT NULL DEFAULT 'unpaid',
    due_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) -- System or User
);

-- RLS for invoices
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own invoices" ON public.invoices
    FOR SELECT USING (
        resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
    );

-- Trigger for invoices updated_at
CREATE TRIGGER invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 5. Create invoice_items table (Snapshot of charges)
CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL, -- e.g. "Security Fee (Oct 2025)"
    amount DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS for invoice_items
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own invoice items" ON public.invoice_items
    FOR SELECT USING (
        invoice_id IN (
            SELECT id FROM public.invoices 
            WHERE resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
        )
    );

COMMIT;
-- Migration: Create Wallet System
-- Resident wallets and transaction history for payment reconciliation

BEGIN;

-- 1. Create wallet transaction type enum
DO $$ BEGIN
    CREATE TYPE wallet_transaction_type AS ENUM ('credit', 'debit');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create resident_wallets table
CREATE TABLE IF NOT EXISTS public.resident_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL UNIQUE REFERENCES public.residents(id) ON DELETE CASCADE,
    balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for resident lookup
CREATE INDEX IF NOT EXISTS idx_resident_wallets_resident ON public.resident_wallets(resident_id);

-- RLS for resident_wallets
ALTER TABLE public.resident_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own wallet" ON public.resident_wallets
    FOR SELECT USING (
        resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())
    );

-- Trigger for updated_at
CREATE TRIGGER resident_wallets_updated_at
    BEFORE UPDATE ON public.resident_wallets
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.resident_wallets(id) ON DELETE CASCADE,
    type wallet_transaction_type NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    balance_after DECIMAL(12, 2) NOT NULL,
    reference_type TEXT, -- 'payment', 'invoice', 'adjustment', 'levy'
    reference_id UUID,   -- ID of the related entity
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for transaction queries
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON public.wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON public.wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_reference ON public.wallet_transactions(reference_type, reference_id);

-- RLS for wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
    FOR ALL USING (public.get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "Residents can view own transactions" ON public.wallet_transactions
    FOR SELECT USING (
        wallet_id IN (
            SELECT w.id FROM public.resident_wallets w
            JOIN public.residents r ON r.id = w.resident_id
            WHERE r.profile_id = auth.uid()
        )
    );

COMMIT;
-- Seed file for Residio database
-- This file will be used to populate initial data

-- Create test users for each role
-- Password for all test users: password123

-- Admin user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'admin@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Admin User", "role": "admin"}',
  '', '', '', ''
);

-- Chairman user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'b2222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'chairman@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Chairman User", "role": "chairman"}',
  '', '', '', ''
);

-- Financial Secretary user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'c3333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated',
  'finance@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Finance Secretary", "role": "financial_secretary"}',
  '', '', '', ''
);

-- Security Officer user
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  email_change_token_new, email_change
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'd4444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated',
  'security@residio.test',
  crypt('password123', gen_salt('bf')),
  NOW(), NOW(), NOW(),
  '{"full_name": "Security Officer", "role": "security_officer"}',
  '', '', '', ''
);

-- Create identity records for each user (required for auth.uid() to work in RLS)
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'a1111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111',
  '{"sub": "a1111111-1111-1111-1111-111111111111", "email": "admin@residio.test", "email_verified": true}',
  'email', 'a1111111-1111-1111-1111-111111111111', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'b2222222-2222-2222-2222-222222222222',
  'b2222222-2222-2222-2222-222222222222',
  '{"sub": "b2222222-2222-2222-2222-222222222222", "email": "chairman@residio.test", "email_verified": true}',
  'email', 'b2222222-2222-2222-2222-222222222222', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'c3333333-3333-3333-3333-333333333333',
  'c3333333-3333-3333-3333-333333333333',
  '{"sub": "c3333333-3333-3333-3333-333333333333", "email": "finance@residio.test", "email_verified": true}',
  'email', 'c3333333-3333-3333-3333-333333333333', NOW(), NOW(), NOW()
);

INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) VALUES (
  'd4444444-4444-4444-4444-444444444444',
  'd4444444-4444-4444-4444-444444444444',
  '{"sub": "d4444444-4444-4444-4444-444444444444", "email": "security@residio.test", "email_verified": true}',
  'email', 'd4444444-4444-4444-4444-444444444444', NOW(), NOW(), NOW()
);

-- Note: The profiles will be auto-created by the trigger on auth.users insert
