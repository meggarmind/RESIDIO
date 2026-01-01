-- Fix: Add admin INSERT and UPDATE policies for report_subscriptions
--
-- Problem: The original migration only created policies for residents to
-- manage their own subscriptions. Admins need to be able to create/update
-- subscriptions for residents (e.g., when creating default subscriptions).

-- Add admin INSERT policy for report_subscriptions
CREATE POLICY "report_subscriptions_admin_insert"
  ON report_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman')
    )
  );

-- Add admin UPDATE policy for consistency
CREATE POLICY "report_subscriptions_admin_update"
  ON report_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman')
    )
  );
