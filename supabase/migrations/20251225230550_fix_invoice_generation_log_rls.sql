-- Fix RLS policies for invoice_generation_log to allow cron/system operations

-- Drop existing policies
DROP POLICY IF EXISTS "invoice_generation_log_select" ON invoice_generation_log;
DROP POLICY IF EXISTS "invoice_generation_log_insert" ON invoice_generation_log;

-- Allow anyone to insert (for cron jobs)
CREATE POLICY "invoice_generation_log_insert" ON invoice_generation_log
    FOR INSERT 
    TO public
    WITH CHECK (true);

-- Allow admins to select (authenticated users with proper roles)
CREATE POLICY "invoice_generation_log_select" ON invoice_generation_log
    FOR SELECT 
    TO public
    USING (
        -- Allow service role (bypasses RLS anyway) and authenticated admins
        auth.uid() IS NULL OR 
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON p.role_id = ar.id
            WHERE p.id = auth.uid()
            AND ar.name IN ('super_admin', 'chairman', 'financial_officer')
        )
    );
