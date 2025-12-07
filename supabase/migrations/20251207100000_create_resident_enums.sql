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
