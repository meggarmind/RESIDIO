-- Migration: Fix Housemates RLS Policy
-- Purpose: Allow residents to view other residents who share the same house
-- Bug Fix: Portal showing "No residents currently assigned" when housemates exist

-- =====================================================
-- Problem:
-- The current RLS policy on residents table only allows users to view
-- their own record (id = get_my_resident_id()). This causes the portal's
-- "Current Occupants" section to show empty because the nested join to
-- residents fails RLS validation for other housemates.
--
-- Solution:
-- Add a policy that allows residents to view any other resident who
-- shares at least one active house assignment with them.
-- =====================================================

-- Policy: Residents can view housemates (others in same house)
CREATE POLICY "Residents can view housemates"
ON public.residents
FOR SELECT
TO authenticated
USING (
  -- Allow viewing residents who share at least one house with the current user
  id IN (
    SELECT rh2.resident_id
    FROM public.resident_houses rh2
    WHERE rh2.house_id IN (
      -- Get all houses the current user is assigned to
      SELECT rh1.house_id
      FROM public.resident_houses rh1
      WHERE rh1.resident_id = public.get_my_resident_id()
      AND rh1.is_active = TRUE
    )
    AND rh2.is_active = TRUE
  )
);

-- =====================================================
-- Also add policy for resident_houses to view other assignments in same house
-- This allows seeing the roles and assignments of housemates
-- =====================================================

-- Policy: Residents can view housemates' house assignments
CREATE POLICY "Residents can view housemates house assignments"
ON public.resident_houses
FOR SELECT
TO authenticated
USING (
  -- Allow viewing house assignments for houses the current user is assigned to
  house_id IN (
    SELECT house_id
    FROM public.resident_houses
    WHERE resident_id = public.get_my_resident_id()
    AND is_active = TRUE
  )
);

-- =====================================================
-- Add comment explaining the RLS structure
-- =====================================================
COMMENT ON POLICY "Residents can view housemates" ON public.residents IS
  'Allows authenticated residents to view other residents who share at least one active house assignment.
   This enables the portal Current Occupants section to display housemates correctly.';

COMMENT ON POLICY "Residents can view housemates house assignments" ON public.resident_houses IS
  'Allows authenticated residents to view the house assignments (roles, move-in dates) of other residents
   in houses they are assigned to. Required for displaying housemate details in portal.';
