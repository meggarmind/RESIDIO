-- Email settings (values must be valid JSON)
INSERT INTO system_settings (key, value, description, category) VALUES
  ('email_enabled', '"true"', 'Master toggle for email notifications', 'email'),
  ('email_from_name', '"Residio Estate"', 'Sender name for emails', 'email'),
  ('email_payment_reminders_enabled', '"true"', 'Enable payment reminder emails', 'email'),
  ('email_invoice_notifications_enabled', '"true"', 'Send email when invoice is generated', 'email'),
  ('email_welcome_enabled', '"true"', 'Send welcome email to new residents', 'email'),
  ('email_last_reminder_run', 'null', 'Timestamp of last reminder run', 'email')
ON CONFLICT (key) DO NOTHING;

-- Email logs table for tracking sent emails
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email TEXT NOT NULL,
    recipient_name TEXT,
    resident_id UUID REFERENCES residents(id) ON DELETE SET NULL,
    email_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    resend_id TEXT,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_email_logs_resident ON email_logs(resident_id);
CREATE INDEX idx_email_logs_type ON email_logs(email_type);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_created ON email_logs(created_at DESC);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Only admins/chairman/finsec can view email logs
CREATE POLICY "Admins can view email logs"
    ON email_logs FOR SELECT
    TO authenticated
    USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- Only system can insert logs (via service role)
CREATE POLICY "Service role can insert email logs"
    ON email_logs FOR INSERT
    TO authenticated
    WITH CHECK (true);

COMMENT ON TABLE email_logs IS 'Tracks all emails sent from the system for audit and debugging';
