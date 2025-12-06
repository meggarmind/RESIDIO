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
