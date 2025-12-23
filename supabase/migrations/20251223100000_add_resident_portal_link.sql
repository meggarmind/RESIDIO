-- Migration: Add Resident Portal Link
-- Purpose: Link profiles table to residents for resident portal access
-- Phase 12: Resident View Portal

-- =====================================================
-- 1. Add resident_id column to profiles table
-- =====================================================
-- This links Supabase Auth users (profiles) to resident records
-- When a resident registers for portal access, their auth account
-- is linked to their existing resident record

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL;

-- Create unique index to ensure one auth account per resident
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_resident_id
ON public.profiles(resident_id)
WHERE resident_id IS NOT NULL;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_resident_id_lookup
ON public.profiles(resident_id);

COMMENT ON COLUMN public.profiles.resident_id IS 'Links auth user to resident record for portal access';

-- =====================================================
-- 2. Add portal tracking columns to residents table
-- =====================================================
-- Track whether a resident has portal access enabled

ALTER TABLE public.residents
ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS portal_enabled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS portal_enabled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.residents.portal_enabled IS 'Whether resident has access to self-service portal';
COMMENT ON COLUMN public.residents.portal_enabled_at IS 'When portal access was enabled';
COMMENT ON COLUMN public.residents.portal_enabled_by IS 'Admin who enabled portal access';

-- =====================================================
-- 3. Create helper function to get resident_id for current user
-- =====================================================
-- This function is used in RLS policies to check if the current
-- authenticated user is a resident and get their resident_id

CREATE OR REPLACE FUNCTION public.get_my_resident_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT resident_id FROM public.profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION public.get_my_resident_id() IS 'Returns the resident_id for the current authenticated user, or NULL if not a resident';

-- =====================================================
-- 4. Create helper function to check if current user is a resident
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_resident()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND resident_id IS NOT NULL
  )
$$;

COMMENT ON FUNCTION public.is_resident() IS 'Returns TRUE if current authenticated user is a resident portal user';

-- =====================================================
-- 5. Grant execute permissions on helper functions
-- =====================================================

GRANT EXECUTE ON FUNCTION public.get_my_resident_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_resident() TO authenticated;
