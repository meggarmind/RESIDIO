-- Phase 11: Alert Management Module - Notification System
-- This migration creates 6 tables for a comprehensive notification system
-- with multi-channel support (email now, SMS/WhatsApp future-proofed)

-- ============================================================================
-- 1. NOTIFICATION_TEMPLATES
-- Stores reusable notification templates with variable placeholders
-- ============================================================================
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,                         -- Internal identifier (e.g., 'payment_reminder_3day')
  display_name TEXT NOT NULL,                        -- Human-readable name
  category TEXT NOT NULL,                            -- 'payment', 'invoice', 'security', 'general'
  channel TEXT NOT NULL DEFAULT 'email',             -- 'email', 'sms', 'whatsapp' (future-proofing)
  subject_template TEXT,                             -- Subject line with {{variables}}
  body_template TEXT NOT NULL,                       -- Body content with {{variables}}
  html_template TEXT,                                -- React Email component name or HTML
  variables JSONB NOT NULL DEFAULT '[]',             -- Array of {name, description, required}
  is_system BOOLEAN NOT NULL DEFAULT false,          -- System templates cannot be deleted
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Index for category + channel queries
CREATE INDEX idx_notification_templates_category_channel ON notification_templates(category, channel);
CREATE INDEX idx_notification_templates_active ON notification_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- 2. NOTIFICATION_SCHEDULES
-- Defines when notifications should be triggered
-- ============================================================================
CREATE TABLE notification_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                                -- 'payment_reminder_schedule'
  template_id UUID NOT NULL REFERENCES notification_templates(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,                        -- 'days_before_due', 'days_after_due', 'event', 'cron'
  trigger_value INTEGER,                             -- Days before/after due date
  cron_expression TEXT,                              -- For cron-based triggers
  event_type TEXT,                                   -- Event that triggers notification (e.g., 'invoice.created')
  escalation_sequence INTEGER DEFAULT 0,             -- Order in escalation workflow (0 = first)
  parent_schedule_id UUID REFERENCES notification_schedules(id) ON DELETE SET NULL, -- For escalation chains
  conditions JSONB,                                  -- Conditions to check before sending
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validate trigger_type values
  CONSTRAINT valid_trigger_type CHECK (
    trigger_type IN ('days_before_due', 'days_after_due', 'event', 'cron')
  )
);

-- Indexes for schedule queries
CREATE INDEX idx_notification_schedules_template ON notification_schedules(template_id);
CREATE INDEX idx_notification_schedules_trigger ON notification_schedules(trigger_type, trigger_value);
CREATE INDEX idx_notification_schedules_event ON notification_schedules(event_type) WHERE event_type IS NOT NULL;
CREATE INDEX idx_notification_schedules_active ON notification_schedules(is_active) WHERE is_active = true;

-- ============================================================================
-- 3. NOTIFICATION_QUEUE
-- Pending notifications waiting to be sent
-- ============================================================================
CREATE TABLE notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES notification_schedules(id) ON DELETE SET NULL,
  recipient_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  recipient_email TEXT,
  recipient_phone TEXT,
  channel TEXT NOT NULL DEFAULT 'email',             -- 'email', 'sms', 'whatsapp'
  subject TEXT,
  body TEXT NOT NULL,
  html_body TEXT,
  variables JSONB,                                   -- Rendered variable values
  priority INTEGER NOT NULL DEFAULT 5,               -- 1 (highest) to 10 (lowest)
  status TEXT NOT NULL DEFAULT 'pending',            -- 'pending', 'processing', 'sent', 'failed', 'cancelled'
  deduplication_key TEXT,                            -- For preventing duplicates
  dedup_window_minutes INTEGER DEFAULT 1440,         -- 24 hours default
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,                                    -- Related entity IDs, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Validate status values
  CONSTRAINT valid_queue_status CHECK (
    status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')
  ),
  -- Validate priority range
  CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10)
);

-- Indexes for queue processing
CREATE INDEX idx_notification_queue_status_scheduled ON notification_queue(status, scheduled_for)
  WHERE status IN ('pending', 'processing');
CREATE INDEX idx_notification_queue_dedup_key ON notification_queue(deduplication_key, created_at)
  WHERE deduplication_key IS NOT NULL;
CREATE INDEX idx_notification_queue_recipient ON notification_queue(recipient_id);
CREATE INDEX idx_notification_queue_channel ON notification_queue(channel, status);

-- ============================================================================
-- 4. NOTIFICATION_HISTORY
-- Immutable log of all sent notifications
-- ============================================================================
CREATE TABLE notification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES notification_queue(id) ON DELETE SET NULL,
  template_id UUID REFERENCES notification_templates(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES notification_schedules(id) ON DELETE SET NULL,
  recipient_id UUID REFERENCES residents(id) ON DELETE SET NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  channel TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT,                                 -- First 500 chars of body
  status TEXT NOT NULL,                              -- 'sent', 'failed', 'bounced', 'delivered'
  external_id TEXT,                                  -- Resend ID, SMS gateway ID, etc.
  error_message TEXT,
  metadata JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,                             -- Future: email tracking
  clicked_at TIMESTAMPTZ,                            -- Future: link tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Validate status values
  CONSTRAINT valid_history_status CHECK (
    status IN ('sent', 'failed', 'bounced', 'delivered', 'opened', 'clicked')
  )
);

-- Indexes for history queries
CREATE INDEX idx_notification_history_recipient ON notification_history(recipient_id);
CREATE INDEX idx_notification_history_template ON notification_history(template_id);
CREATE INDEX idx_notification_history_sent_at ON notification_history(sent_at DESC);
CREATE INDEX idx_notification_history_channel ON notification_history(channel);
CREATE INDEX idx_notification_history_status ON notification_history(status);

-- ============================================================================
-- 5. NOTIFICATION_PREFERENCES
-- Per-resident notification settings
-- ============================================================================
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  category TEXT NOT NULL,                            -- 'payment', 'invoice', 'security', 'general'
  channel TEXT NOT NULL DEFAULT 'email',             -- 'email', 'sms', 'whatsapp'
  enabled BOOLEAN NOT NULL DEFAULT true,
  frequency TEXT DEFAULT 'all',                      -- 'all', 'daily_digest', 'weekly_digest', 'none'
  quiet_hours_start TIME,                            -- Don't send between these hours
  quiet_hours_end TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Each resident can have one preference per category+channel
  UNIQUE(resident_id, category, channel),

  -- Validate frequency values
  CONSTRAINT valid_frequency CHECK (
    frequency IN ('all', 'daily_digest', 'weekly_digest', 'none')
  )
);

-- Indexes for preference lookups
CREATE INDEX idx_notification_preferences_resident ON notification_preferences(resident_id);
CREATE INDEX idx_notification_preferences_category ON notification_preferences(category, channel);

-- ============================================================================
-- 6. ESCALATION_STATES
-- Tracks escalation workflow progress per entity
-- ============================================================================
CREATE TABLE escalation_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,                         -- 'invoice', 'payment', etc.
  entity_id UUID NOT NULL,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  current_level INTEGER NOT NULL DEFAULT 0,
  last_notification_id UUID REFERENCES notification_history(id) ON DELETE SET NULL,
  last_notified_at TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One escalation state per entity + resident
  UNIQUE(entity_type, entity_id, resident_id)
);

-- Indexes for escalation queries
CREATE INDEX idx_escalation_states_entity ON escalation_states(entity_type, entity_id);
CREATE INDEX idx_escalation_states_next ON escalation_states(next_scheduled_at)
  WHERE NOT is_resolved;
CREATE INDEX idx_escalation_states_resident ON escalation_states(resident_id);

-- ============================================================================
-- TRIGGERS: Auto-update updated_at timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_notification_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER notification_schedules_updated_at
  BEFORE UPDATE ON notification_schedules
  FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

CREATE TRIGGER escalation_states_updated_at
  BEFORE UPDATE ON escalation_states
  FOR EACH ROW EXECUTE FUNCTION update_notification_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_states ENABLE ROW LEVEL SECURITY;

-- Policies for notification_templates (admin/chairman can manage, all authenticated can read)
CREATE POLICY "notification_templates_select" ON notification_templates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "notification_templates_insert" ON notification_templates
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "notification_templates_update" ON notification_templates
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'))
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "notification_templates_delete" ON notification_templates
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman') AND is_system = false);

-- Policies for notification_schedules
CREATE POLICY "notification_schedules_select" ON notification_schedules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "notification_schedules_insert" ON notification_schedules
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "notification_schedules_update" ON notification_schedules
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'))
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "notification_schedules_delete" ON notification_schedules
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'));

-- Policies for notification_queue (admin/chairman can manage)
CREATE POLICY "notification_queue_select" ON notification_queue
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "notification_queue_insert" ON notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "notification_queue_update" ON notification_queue
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'))
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "notification_queue_delete" ON notification_queue
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'));

-- Policies for notification_history (admin/chairman can view all, others can view own)
CREATE POLICY "notification_history_select" ON notification_history
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- No insert/update/delete policies - history is immutable, managed by system

-- Policies for notification_preferences
CREATE POLICY "notification_preferences_select" ON notification_preferences
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "notification_preferences_insert" ON notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "notification_preferences_update" ON notification_preferences
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'))
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "notification_preferences_delete" ON notification_preferences
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'));

-- Policies for escalation_states
CREATE POLICY "escalation_states_select" ON escalation_states
  FOR SELECT TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "escalation_states_insert" ON escalation_states
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "escalation_states_update" ON escalation_states
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'))
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "escalation_states_delete" ON escalation_states
  FOR DELETE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'));

-- ============================================================================
-- SEED DATA: System Templates
-- ============================================================================
INSERT INTO notification_templates (name, display_name, category, channel, subject_template, body_template, variables, is_system) VALUES
-- Payment Reminders
('payment_reminder_7day', 'Payment Reminder (7 Days)', 'payment', 'email',
 'Payment Reminder: {{invoice_number}}',
 'Dear {{resident_name}},

Your payment of ₦{{amount_due}} for {{house_address}} is due in 7 days on {{due_date}}.

Please ensure timely payment to avoid any inconvenience.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"invoice_number","description":"Invoice reference number","required":true},{"name":"amount_due","description":"Amount to be paid","required":true},{"name":"house_address","description":"House address","required":true},{"name":"due_date","description":"Payment due date","required":true}]',
 true),

('payment_reminder_3day', 'Payment Reminder (3 Days)', 'payment', 'email',
 'Urgent: Payment Due Soon - {{invoice_number}}',
 'Dear {{resident_name}},

This is a reminder that your payment of ₦{{amount_due}} is due in 3 days on {{due_date}}.

Please make your payment as soon as possible to avoid late fees.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"invoice_number","description":"Invoice reference number","required":true},{"name":"amount_due","description":"Amount to be paid","required":true},{"name":"due_date","description":"Payment due date","required":true}]',
 true),

('payment_reminder_1day', 'Payment Reminder (1 Day)', 'payment', 'email',
 'FINAL REMINDER: Payment Due Tomorrow - {{invoice_number}}',
 'Dear {{resident_name}},

This is your final reminder. Your payment of ₦{{amount_due}} is due tomorrow.

Please make your payment today to avoid late fees and service interruptions.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"invoice_number","description":"Invoice reference number","required":true},{"name":"amount_due","description":"Amount to be paid","required":true}]',
 true),

-- Overdue Notifications
('payment_overdue_1day', 'Payment Overdue (1 Day)', 'payment', 'email',
 'Payment Overdue: {{invoice_number}}',
 'Dear {{resident_name}},

Your payment of ₦{{amount_due}} is now 1 day overdue.

Late fees may apply. Please make your payment immediately to avoid further penalties.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"invoice_number","description":"Invoice reference number","required":true},{"name":"amount_due","description":"Amount to be paid","required":true}]',
 true),

-- Invoice Notifications
('invoice_generated', 'Invoice Generated', 'invoice', 'email',
 'New Invoice: {{invoice_number}}',
 'Dear {{resident_name}},

A new invoice {{invoice_number}} for ₦{{amount_due}} has been generated for {{house_address}}.

Due Date: {{due_date}}

Please make your payment before the due date.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"invoice_number","description":"Invoice reference number","required":true},{"name":"amount_due","description":"Amount to be paid","required":true},{"name":"house_address","description":"House address","required":true},{"name":"due_date","description":"Payment due date","required":true}]',
 true),

-- Welcome Email
('welcome_resident', 'Welcome Resident', 'general', 'email',
 'Welcome to {{estate_name}}!',
 'Dear {{resident_name}},

Welcome to {{estate_name}}!

Your resident account has been created. Here are your details:
- Resident Code: {{resident_code}}
- Email: {{email}}

You can use your resident code for estate access and identification.

Best regards,
Estate Management',
 '[{"name":"resident_name","description":"Resident full name","required":true},{"name":"estate_name","description":"Estate name","required":true},{"name":"resident_code","description":"6-digit resident code","required":true},{"name":"email","description":"Resident email address","required":true}]',
 true);

-- ============================================================================
-- COMMENTS
-- ============================================================================
COMMENT ON TABLE notification_templates IS 'Stores reusable notification templates with variable placeholders for multi-channel notifications';
COMMENT ON TABLE notification_schedules IS 'Defines when notifications should be triggered based on time or events';
COMMENT ON TABLE notification_queue IS 'Queue of pending notifications to be processed and sent';
COMMENT ON TABLE notification_history IS 'Immutable log of all sent notifications for audit and tracking';
COMMENT ON TABLE notification_preferences IS 'Per-resident notification settings for categories and channels';
COMMENT ON TABLE escalation_states IS 'Tracks escalation workflow progress for entities like invoices';
