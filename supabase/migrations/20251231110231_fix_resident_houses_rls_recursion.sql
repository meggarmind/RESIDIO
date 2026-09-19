-- Fix infinite recursion in resident_houses RLS policy
-- The "housemates" policy queries resident_houses within resident_houses policy, causing recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Residents can view housemates house assignments" ON resident_houses;

-- Create a helper function that bypasses RLS to get resident's house IDs
-- This function runs with SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION get_my_house_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT house_id 
  FROM resident_houses 
  WHERE resident_id = get_my_resident_id() 
    AND is_active = true;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_my_house_ids() TO authenticated;

-- Recreate the housemates policy using the helper function
-- This avoids the recursion because the function bypasses RLS
CREATE POLICY "Residents can view housemates house assignments"
ON resident_houses
FOR SELECT
TO authenticated
USING (house_id IN (SELECT get_my_house_ids()));
