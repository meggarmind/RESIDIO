-- Role Assignment Rules: Configures which resident types can be assigned which executive roles
-- This enables fine-grained control over role eligibility based on residency status

CREATE TABLE role_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_role TEXT NOT NULL,           -- The resident type (resident_landlord, tenant, etc.)
    app_role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    is_allowed BOOLEAN DEFAULT TRUE,       -- Whether this combination is allowed
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(resident_role, app_role_id)
);

-- Create index for efficient lookups
CREATE INDEX idx_role_assignment_rules_resident_role ON role_assignment_rules(resident_role);
CREATE INDEX idx_role_assignment_rules_app_role_id ON role_assignment_rules(app_role_id);

-- RLS policies
ALTER TABLE role_assignment_rules ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read rules (for UI rendering)
CREATE POLICY "Authenticated users can read role assignment rules"
ON role_assignment_rules FOR SELECT
TO authenticated
USING (true);

-- Only users with system.manage_roles permission can modify
CREATE POLICY "Admins can manage role assignment rules"
ON role_assignment_rules FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN role_permissions rp ON rp.role_id = p.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        WHERE p.id = auth.uid() AND ap.name = 'system.manage_roles'
    )
);

-- Insert default rules (allow all primary resident types to be assigned executive roles)
-- Secondary roles (household_member, domestic_staff, caretaker) are restricted by default
INSERT INTO role_assignment_rules (resident_role, app_role_id, is_allowed)
SELECT 
    rt.role_type,
    ar.id,
    CASE 
        -- Primary residents can hold executive roles
        WHEN rt.role_type IN ('resident_landlord', 'non_resident_landlord', 'tenant', 'developer') 
             AND ar.category = 'exco' THEN TRUE
        -- Co-residents can hold some roles
        WHEN rt.role_type = 'co_resident' 
             AND ar.name IN ('secretary', 'project_manager') THEN TRUE
        -- Everyone can be assigned 'resident' role
        WHEN ar.name = 'resident' THEN TRUE
        -- Restrict household members and staff from executive roles
        WHEN rt.role_type IN ('household_member', 'domestic_staff', 'caretaker') 
             AND ar.category = 'exco' THEN FALSE
        ELSE FALSE
    END
FROM (
    VALUES 
        ('resident_landlord'),
        ('non_resident_landlord'),
        ('tenant'),
        ('developer'),
        ('co_resident'),
        ('household_member'),
        ('domestic_staff'),
        ('caretaker')
) AS rt(role_type)
CROSS JOIN app_roles ar
WHERE ar.is_active = TRUE
ON CONFLICT (resident_role, app_role_id) DO NOTHING;

-- Update trigger
CREATE TRIGGER update_role_assignment_rules_updated_at
BEFORE UPDATE ON role_assignment_rules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Function to check if a role assignment is allowed
CREATE OR REPLACE FUNCTION is_role_assignment_allowed(
    p_user_id UUID,
    p_app_role_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resident_id UUID;
    v_resident_role TEXT;
    v_is_allowed BOOLEAN;
BEGIN
    -- Get user's resident_id
    SELECT resident_id INTO v_resident_id
    FROM profiles WHERE id = p_user_id;
    
    -- If user has no resident_id, allow assignment (they're pure admin)
    IF v_resident_id IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's primary resident role (from their most recent active house assignment)
    SELECT rh.resident_role INTO v_resident_role
    FROM resident_houses rh
    WHERE rh.resident_id = v_resident_id
      AND rh.is_active = TRUE
    ORDER BY rh.is_primary DESC, rh.move_in_date DESC
    LIMIT 1;
    
    -- If no active residency, treat as no restriction
    IF v_resident_role IS NULL THEN
        RETURN TRUE;
    END IF;
    
    -- Check the rules table
    SELECT is_allowed INTO v_is_allowed
    FROM role_assignment_rules
    WHERE resident_role = v_resident_role
      AND app_role_id = p_app_role_id;
    
    -- If no explicit rule, default to allowed
    RETURN COALESCE(v_is_allowed, TRUE);
END;
$$;

COMMENT ON TABLE role_assignment_rules IS 'Configurable rules for which resident types can be assigned which executive roles';
COMMENT ON FUNCTION is_role_assignment_allowed IS 'Checks if a specific role can be assigned to a user based on their resident type';
