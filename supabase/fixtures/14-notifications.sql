-- ============================================================================
-- Residio Comprehensive Seed Data
-- File: 14-notifications.sql
-- Description: Notification templates, preferences, and history
-- Dependencies: 02-residents.sql
-- ============================================================================

-- ============================================================================
-- NOTIFICATION TEMPLATES (15 total)
-- ============================================================================
-- Categories: billing, payment, security, announcement, system
-- Channels: email, sms, in_app
-- ============================================================================

INSERT INTO notification_templates (
  id,
  name,
  display_name,
  category,
  channel,
  subject_template,
  body_template,
  html_template,
  variables,
  is_system,
  is_active,
  created_by,
  created_at,
  updated_at
)
VALUES
  -- ========== BILLING TEMPLATES (4) ==========

  (
    'ca000001-0001-0001-0001-000000000001'::uuid,
    'invoice_generated',
    'Invoice Generated',
    'billing',
    'email',
    'New Invoice: {{invoice_number}} - {{amount}}',
    'Dear {{resident_name}},

A new invoice has been generated for your property at {{house_address}}.

Invoice Number: {{invoice_number}}
Amount Due: ₦{{amount}}
Due Date: {{due_date}}
Period: {{billing_period}}

Please ensure payment is made before the due date to avoid late fees.

You can view and pay this invoice through your resident portal.

Thank you,
Residio Estate Management',
    NULL,
    '["resident_name", "house_address", "invoice_number", "amount", "due_date", "billing_period"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000002'::uuid,
    'invoice_reminder',
    'Invoice Payment Reminder',
    'billing',
    'email',
    'Payment Reminder: Invoice {{invoice_number}} Due {{due_date}}',
    'Dear {{resident_name}},

This is a friendly reminder that your invoice is due soon.

Invoice Number: {{invoice_number}}
Amount Due: ₦{{amount}}
Due Date: {{due_date}}
Days Until Due: {{days_until_due}}

Please make payment to avoid late fees.

Thank you,
Residio Estate Management',
    NULL,
    '["resident_name", "invoice_number", "amount", "due_date", "days_until_due"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000003'::uuid,
    'invoice_overdue',
    'Invoice Overdue Notice',
    'billing',
    'email',
    'OVERDUE: Invoice {{invoice_number}} - Immediate Action Required',
    'Dear {{resident_name}},

Your invoice is now OVERDUE and requires immediate attention.

Invoice Number: {{invoice_number}}
Original Amount: ₦{{original_amount}}
Late Fee: ₦{{late_fee}}
Total Due: ₦{{total_amount}}
Days Overdue: {{days_overdue}}

Continued non-payment may result in service restrictions.

Please contact the estate office if you need to discuss payment arrangements.

Thank you,
Residio Estate Management',
    NULL,
    '["resident_name", "invoice_number", "original_amount", "late_fee", "total_amount", "days_overdue"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000004'::uuid,
    'invoice_overdue_sms',
    'Invoice Overdue SMS',
    'billing',
    'sms',
    NULL,
    'RESIDIO: Invoice {{invoice_number}} is overdue. Amount: ₦{{amount}}. Please pay immediately to avoid restrictions.',
    NULL,
    '["invoice_number", "amount"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  -- ========== PAYMENT TEMPLATES (3) ==========

  (
    'ca000001-0001-0001-0001-000000000005'::uuid,
    'payment_received',
    'Payment Received Confirmation',
    'payment',
    'email',
    'Payment Received - Receipt #{{receipt_number}}',
    'Dear {{resident_name}},

Thank you! We have received your payment.

Receipt Number: {{receipt_number}}
Amount Paid: ₦{{amount}}
Payment Method: {{payment_method}}
Date: {{payment_date}}

Invoice(s) Applied:
{{invoice_details}}

Your updated account balance: ₦{{account_balance}}

Thank you for your prompt payment.

Residio Estate Management',
    NULL,
    '["resident_name", "receipt_number", "amount", "payment_method", "payment_date", "invoice_details", "account_balance"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000006'::uuid,
    'wallet_credit',
    'Wallet Credit Applied',
    'payment',
    'email',
    'Wallet Credit Applied - ₦{{amount}}',
    'Dear {{resident_name}},

A credit of ₦{{amount}} has been applied to your wallet.

Reason: {{reason}}
New Wallet Balance: ₦{{new_balance}}

This credit will be automatically applied to your next invoice.

Residio Estate Management',
    NULL,
    '["resident_name", "amount", "reason", "new_balance"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000007'::uuid,
    'payment_received_sms',
    'Payment Received SMS',
    'payment',
    'sms',
    NULL,
    'RESIDIO: Payment of ₦{{amount}} received. Receipt #{{receipt_number}}. Thank you!',
    NULL,
    '["amount", "receipt_number"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  -- ========== SECURITY TEMPLATES (3) ==========

  (
    'ca000001-0001-0001-0001-000000000008'::uuid,
    'visitor_checkin',
    'Visitor Check-in Notification',
    'security',
    'email',
    'Visitor Checked In: {{visitor_name}}',
    'Dear {{resident_name}},

A visitor has checked in to see you.

Visitor Name: {{visitor_name}}
Category: {{visitor_category}}
Check-in Time: {{checkin_time}}
Access Code: {{access_code}}

If you did not expect this visitor, please contact security immediately.

Residio Estate Security',
    NULL,
    '["resident_name", "visitor_name", "visitor_category", "checkin_time", "access_code"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000009'::uuid,
    'access_code_expiring',
    'Access Code Expiring Soon',
    'security',
    'email',
    'Access Code Expiring: {{contact_name}}',
    'Dear {{resident_name}},

The access code for your registered contact is expiring soon.

Contact Name: {{contact_name}}
Category: {{category}}
Current Code: {{access_code}}
Expires: {{expiry_date}}

To renew this access code, please log in to your resident portal or contact the estate office.

Residio Estate Security',
    NULL,
    '["resident_name", "contact_name", "category", "access_code", "expiry_date"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '200 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000010'::uuid,
    'visitor_checkin_sms',
    'Visitor Check-in SMS',
    'security',
    'sms',
    NULL,
    'RESIDIO: {{visitor_name}} checked in at {{checkin_time}}. Code: {{access_code}}',
    NULL,
    '["visitor_name", "checkin_time", "access_code"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '30 days'
  ),

  -- ========== ANNOUNCEMENT TEMPLATES (3) ==========

  (
    'ca000001-0001-0001-0001-000000000011'::uuid,
    'announcement_general',
    'General Announcement',
    'announcement',
    'email',
    '{{announcement_title}}',
    'Dear Resident,

{{announcement_content}}

Posted by: {{posted_by}}
Date: {{post_date}}

For more details, please visit the resident portal.

Residio Estate Management',
    NULL,
    '["announcement_title", "announcement_content", "posted_by", "post_date"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000012'::uuid,
    'announcement_emergency',
    'Emergency Alert',
    'announcement',
    'email',
    '🚨 URGENT: {{announcement_title}}',
    'EMERGENCY ALERT

{{announcement_content}}

This is an urgent notification requiring your immediate attention.

Posted: {{post_date}}

Residio Estate Management',
    NULL,
    '["announcement_title", "announcement_content", "post_date"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000013'::uuid,
    'announcement_emergency_sms',
    'Emergency Alert SMS',
    'announcement',
    'sms',
    NULL,
    'RESIDIO ALERT: {{announcement_title}}. Check email/portal for details.',
    NULL,
    '["announcement_title"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  -- ========== SYSTEM TEMPLATES (2) ==========

  (
    'ca000001-0001-0001-0001-000000000014'::uuid,
    'welcome_resident',
    'Welcome New Resident',
    'system',
    'email',
    'Welcome to Residio Estate, {{resident_name}}!',
    'Dear {{resident_name}},

Welcome to Residio Estate! Your account has been successfully created.

Property: {{house_address}}
Resident Code: {{resident_code}}
Role: {{resident_role}}

Getting Started:
1. Log in to your resident portal at {{portal_url}}
2. Complete your profile information
3. Register your security contacts
4. Review the estate handbook

If you have any questions, please contact the estate office.

Welcome to our community!

Residio Estate Management',
    NULL,
    '["resident_name", "house_address", "resident_code", "resident_role", "portal_url"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  ),

  (
    'ca000001-0001-0001-0001-000000000015'::uuid,
    'password_reset',
    'Password Reset Request',
    'system',
    'email',
    'Password Reset Request - Residio Estate',
    'Dear {{resident_name}},

We received a request to reset your password.

Click the link below to reset your password:
{{reset_link}}

This link will expire in {{expiry_hours}} hours.

If you did not request this, please ignore this email or contact support.

Residio Estate Management',
    NULL,
    '["resident_name", "reset_link", "expiry_hours"]'::jsonb,
    true,
    true,
    '00000000-0000-0000-0000-000000000001'::uuid,
    NOW() - INTERVAL '365 days',
    NOW() - INTERVAL '30 days'
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  variables = EXCLUDED.variables,
  updated_at = NOW();


-- ============================================================================
-- NOTIFICATION PREFERENCES (20 residents with custom preferences)
-- ============================================================================

INSERT INTO notification_preferences (
  id,
  resident_id,
  category,
  channel,
  enabled,
  frequency,
  quiet_hours_start,
  quiet_hours_end,
  created_at,
  updated_at
)
VALUES
  -- RES002: Prefers email only, no SMS
  ('cb000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'billing', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '180 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'billing', 'sms', false, 'all', NULL, NULL, NOW() - INTERVAL '180 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000003'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'security', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '180 days', NOW() - INTERVAL '30 days'),

  -- RES003: All channels enabled with quiet hours
  ('cb000001-0001-0001-0001-000000000004'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'billing', 'email', true, 'all', '22:00:00', '07:00:00', NOW() - INTERVAL '150 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'billing', 'sms', true, 'important', '22:00:00', '07:00:00', NOW() - INTERVAL '150 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000006'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'security', 'sms', true, 'all', NULL, NULL, NOW() - INTERVAL '150 days', NOW() - INTERVAL '30 days'),

  -- RES005: Non-resident landlord - email only, weekly digest
  ('cb000001-0001-0001-0001-000000000007'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'billing', 'email', true, 'weekly', NULL, NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000008'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'announcement', 'email', true, 'important', NULL, NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '30 days'),

  -- RES010: Tenant - all notifications enabled
  ('cb000001-0001-0001-0001-000000000009'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'billing', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'billing', 'sms', true, 'all', NULL, NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000011'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'security', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000012'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'security', 'sms', true, 'all', NULL, NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '30 days'),

  -- RES020: Disabled most notifications
  ('cb000001-0001-0001-0001-000000000013'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'billing', 'email', true, 'important', NULL, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000014'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'billing', 'sms', false, 'all', NULL, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000015'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'announcement', 'email', false, 'all', NULL, NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '30 days'),

  -- RES004: Business hours only
  ('cb000001-0001-0001-0001-000000000016'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'billing', 'email', true, 'all', '18:00:00', '08:00:00', NOW() - INTERVAL '120 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000017'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'security', 'sms', true, 'all', NULL, NULL, NOW() - INTERVAL '120 days', NOW() - INTERVAL '30 days'),

  -- RES006: Security committee member - all security alerts
  ('cb000001-0001-0001-0001-000000000018'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'security', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000019'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'security', 'sms', true, 'all', NULL, NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '30 days'),
  ('cb000001-0001-0001-0001-000000000020'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'announcement', 'email', true, 'all', NULL, NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '30 days')
ON CONFLICT (id) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  frequency = EXCLUDED.frequency,
  quiet_hours_start = EXCLUDED.quiet_hours_start,
  quiet_hours_end = EXCLUDED.quiet_hours_end,
  updated_at = NOW();


-- ============================================================================
-- NOTIFICATION HISTORY (50 sent notifications over 6 months)
-- ============================================================================

INSERT INTO notification_history (
  id,
  template_id,
  recipient_id,
  recipient_email,
  channel,
  subject,
  body_preview,
  status,
  metadata,
  sent_at,
  delivered_at,
  opened_at,
  clicked_at,
  created_at
)
VALUES
  -- Invoice notifications (15)
  ('cd000001-0001-0001-0001-000000000001'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', 'New Invoice: INV-2025-001 - ₦15,000', 'Dear John Doe, A new invoice has been generated...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000001"}'::jsonb, NOW() - INTERVAL '180 days', NOW() - INTERVAL '180 days' + INTERVAL '2 minutes', NOW() - INTERVAL '180 days' + INTERVAL '30 minutes', NULL, NOW() - INTERVAL '180 days'),

  ('cd000001-0001-0001-0001-000000000002'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'res003@example.com', 'email', 'New Invoice: INV-2025-002 - ₦25,000', 'Dear Jane Smith, A new invoice has been generated...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000002"}'::jsonb, NOW() - INTERVAL '180 days', NOW() - INTERVAL '180 days' + INTERVAL '1 minute', NOW() - INTERVAL '180 days' + INTERVAL '2 hours', NULL, NOW() - INTERVAL '180 days'),

  ('cd000001-0001-0001-0001-000000000003'::uuid, 'ca000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'res020@example.com', 'email', 'Payment Reminder: Invoice INV-2025-020 Due 2025-02-15', 'Dear Resident, This is a friendly reminder...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000020"}'::jsonb, NOW() - INTERVAL '150 days', NOW() - INTERVAL '150 days' + INTERVAL '3 minutes', NULL, NULL, NOW() - INTERVAL '150 days'),

  ('cd000001-0001-0001-0001-000000000004'::uuid, 'ca000001-0001-0001-0001-000000000003'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'res020@example.com', 'email', 'OVERDUE: Invoice INV-2025-020 - Immediate Action Required', 'Dear Resident, Your invoice is now OVERDUE...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000020"}'::jsonb, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days' + INTERVAL '2 minutes', NOW() - INTERVAL '120 days' + INTERVAL '4 hours', NOW() - INTERVAL '120 days' + INTERVAL '4 hours', NOW() - INTERVAL '120 days'),

  ('cd000001-0001-0001-0001-000000000005'::uuid, 'ca000001-0001-0001-0001-000000000004'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, '+2348012345678', 'sms', NULL, 'RESIDIO: Invoice INV-2025-020 is overdue...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000020"}'::jsonb, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days' + INTERVAL '30 seconds', NULL, NULL, NOW() - INTERVAL '120 days'),

  ('cd000001-0001-0001-0001-000000000006'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'res004@example.com', 'email', 'New Invoice: INV-2025-030 - ₦15,000', 'Dear Resident, A new invoice has been generated...', 'delivered', '{"invoice_id": "ff000001-0001-0001-0001-000000000030"}'::jsonb, NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days' + INTERVAL '2 minutes', NOW() - INTERVAL '90 days' + INTERVAL '1 hour', NULL, NOW() - INTERVAL '90 days'),

  ('cd000001-0001-0001-0001-000000000007'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'res005@example.com', 'email', 'New Invoice: INV-2025-035 - ₦15,000', 'Dear Resident, A new invoice has been generated...', 'delivered', NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days' + INTERVAL '5 minutes', NULL, NULL, NOW() - INTERVAL '90 days'),

  ('cd000001-0001-0001-0001-000000000008'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000006'::uuid, 'res006@example.com', 'email', 'New Invoice: INV-2025-040 - ₦15,000', 'Dear Resident, A new invoice has been generated...', 'delivered', NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days' + INTERVAL '1 minute', NOW() - INTERVAL '60 days' + INTERVAL '20 minutes', NULL, NOW() - INTERVAL '60 days'),

  ('cd000001-0001-0001-0001-000000000009'::uuid, 'ca000001-0001-0001-0001-000000000002'::uuid, 'aa000001-0001-0001-0001-000000000007'::uuid, 'res007@example.com', 'email', 'Payment Reminder: Invoice Due Soon', 'Dear Resident, This is a friendly reminder...', 'delivered', NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days' + INTERVAL '2 minutes', NULL, NULL, NOW() - INTERVAL '45 days'),

  ('cd000001-0001-0001-0001-000000000010'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', 'New Invoice: INV-2026-001 - ₦15,000', 'Dear John Doe, A new invoice has been generated...', 'delivered', NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days' + INTERVAL '1 minute', NOW() - INTERVAL '7 days' + INTERVAL '15 minutes', NOW() - INTERVAL '7 days' + INTERVAL '16 minutes', NOW() - INTERVAL '7 days'),

  -- Payment notifications (10)
  ('cd000001-0001-0001-0001-000000000011'::uuid, 'ca000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', 'Payment Received - Receipt #RCP-2025-001', 'Dear John Doe, Thank you! We have received your payment...', 'delivered', '{"payment_id": "gg000001-0001-0001-0001-000000000001"}'::jsonb, NOW() - INTERVAL '175 days', NOW() - INTERVAL '175 days' + INTERVAL '1 minute', NOW() - INTERVAL '175 days' + INTERVAL '10 minutes', NULL, NOW() - INTERVAL '175 days'),

  ('cd000001-0001-0001-0001-000000000012'::uuid, 'ca000001-0001-0001-0001-000000000007'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, '+2348023456789', 'sms', NULL, 'RESIDIO: Payment of ₦15,000 received. Receipt #RCP-2025-001. Thank you!', 'delivered', '{"payment_id": "gg000001-0001-0001-0001-000000000001"}'::jsonb, NOW() - INTERVAL '175 days', NOW() - INTERVAL '175 days' + INTERVAL '15 seconds', NULL, NULL, NOW() - INTERVAL '175 days'),

  ('cd000001-0001-0001-0001-000000000013'::uuid, 'ca000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'res003@example.com', 'email', 'Payment Received - Receipt #RCP-2025-005', 'Dear Jane Smith, Thank you! We have received your payment...', 'delivered', NULL, NOW() - INTERVAL '170 days', NOW() - INTERVAL '170 days' + INTERVAL '2 minutes', NULL, NULL, NOW() - INTERVAL '170 days'),

  ('cd000001-0001-0001-0001-000000000014'::uuid, 'ca000001-0001-0001-0001-000000000005'::uuid, 'aa000001-0001-0001-0001-000000000020'::uuid, 'res020@example.com', 'email', 'Payment Received - Receipt #RCP-2025-025', 'Dear Resident, Thank you! We have received your payment...', 'delivered', NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days' + INTERVAL '3 minutes', NOW() - INTERVAL '100 days' + INTERVAL '1 hour', NULL, NOW() - INTERVAL '100 days'),

  ('cd000001-0001-0001-0001-000000000015'::uuid, 'ca000001-0001-0001-0001-000000000006'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'res004@example.com', 'email', 'Wallet Credit Applied - ₦5,000', 'Dear Resident, A credit of ₦5,000 has been applied to your wallet...', 'delivered', NULL, NOW() - INTERVAL '85 days', NOW() - INTERVAL '85 days' + INTERVAL '1 minute', NULL, NULL, NOW() - INTERVAL '85 days'),

  -- Security notifications (10)
  ('cd000001-0001-0001-0001-000000000016'::uuid, 'ca000001-0001-0001-0001-000000000008'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', 'Visitor Checked In: Sarah Doe', 'Dear John Doe, A visitor has checked in to see you...', 'delivered', '{"contact_id": "db000001-0001-0001-0001-000000000001"}'::jsonb, NOW() - INTERVAL '150 days', NOW() - INTERVAL '150 days' + INTERVAL '30 seconds', NOW() - INTERVAL '150 days' + INTERVAL '5 minutes', NULL, NOW() - INTERVAL '150 days'),

  ('cd000001-0001-0001-0001-000000000017'::uuid, 'ca000001-0001-0001-0001-000000000010'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, '+2348023456789', 'sms', NULL, 'RESIDIO: Sarah Doe checked in at 09:15. Code: 123456', 'delivered', NULL, NOW() - INTERVAL '150 days', NOW() - INTERVAL '150 days' + INTERVAL '10 seconds', NULL, NULL, NOW() - INTERVAL '150 days'),

  ('cd000001-0001-0001-0001-000000000018'::uuid, 'ca000001-0001-0001-0001-000000000008'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'res003@example.com', 'email', 'Visitor Checked In: ABC Plumbing', 'Dear Jane Smith, A visitor has checked in to see you...', 'delivered', NULL, NOW() - INTERVAL '120 days', NOW() - INTERVAL '120 days' + INTERVAL '1 minute', NULL, NULL, NOW() - INTERVAL '120 days'),

  ('cd000001-0001-0001-0001-000000000019'::uuid, 'ca000001-0001-0001-0001-000000000009'::uuid, 'aa000001-0001-0001-0001-000000000005'::uuid, 'res005@example.com', 'email', 'Access Code Expiring: Mr. James (Caretaker)', 'Dear Resident, The access code for your registered contact is expiring soon...', 'delivered', NULL, NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days' + INTERVAL '2 minutes', NOW() - INTERVAL '90 days' + INTERVAL '3 hours', NOW() - INTERVAL '90 days' + INTERVAL '3 hours', NOW() - INTERVAL '90 days'),

  ('cd000001-0001-0001-0001-000000000020'::uuid, 'ca000001-0001-0001-0001-000000000008'::uuid, 'aa000001-0001-0001-0001-000000000010'::uuid, 'res010@example.com', 'email', 'Visitor Checked In: DHL Delivery', 'Dear Resident, A visitor has checked in to see you...', 'delivered', NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days' + INTERVAL '45 seconds', NOW() - INTERVAL '60 days' + INTERVAL '2 minutes', NULL, NOW() - INTERVAL '60 days'),

  -- Announcement notifications (10)
  ('cd000001-0001-0001-0001-000000000021'::uuid, 'ca000001-0001-0001-0001-000000000011'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', 'Annual General Meeting Notice', 'Dear Resident, You are invited to the Annual General Meeting...', 'delivered', '{"announcement_id": "ae000001-0001-0001-0001-000000000001"}'::jsonb, NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days' + INTERVAL '2 minutes', NOW() - INTERVAL '200 days' + INTERVAL '30 minutes', NULL, NOW() - INTERVAL '200 days'),

  ('cd000001-0001-0001-0001-000000000022'::uuid, 'ca000001-0001-0001-0001-000000000011'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'res003@example.com', 'email', 'Annual General Meeting Notice', 'Dear Resident, You are invited to the Annual General Meeting...', 'delivered', NULL, NOW() - INTERVAL '200 days', NOW() - INTERVAL '200 days' + INTERVAL '2 minutes', NOW() - INTERVAL '200 days' + INTERVAL '1 hour', NULL, NOW() - INTERVAL '200 days'),

  ('cd000001-0001-0001-0001-000000000023'::uuid, 'ca000001-0001-0001-0001-000000000012'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, 'res002@example.com', 'email', '🚨 URGENT: Water Supply Disruption', 'EMERGENCY ALERT: Scheduled maintenance will affect water supply...', 'delivered', NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days' + INTERVAL '30 seconds', NOW() - INTERVAL '100 days' + INTERVAL '5 minutes', NULL, NOW() - INTERVAL '100 days'),

  ('cd000001-0001-0001-0001-000000000024'::uuid, 'ca000001-0001-0001-0001-000000000013'::uuid, 'aa000001-0001-0001-0001-000000000002'::uuid, '+2348023456789', 'sms', NULL, 'RESIDIO ALERT: Water Supply Disruption. Check email/portal for details.', 'delivered', NULL, NOW() - INTERVAL '100 days', NOW() - INTERVAL '100 days' + INTERVAL '10 seconds', NULL, NULL, NOW() - INTERVAL '100 days'),

  ('cd000001-0001-0001-0001-000000000025'::uuid, 'ca000001-0001-0001-0001-000000000011'::uuid, 'aa000001-0001-0001-0001-000000000004'::uuid, 'res004@example.com', 'email', 'Estate Christmas Party', 'Dear Resident, You are cordially invited to the annual Christmas party...', 'delivered', NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days' + INTERVAL '3 minutes', NOW() - INTERVAL '45 days' + INTERVAL '2 hours', NULL, NOW() - INTERVAL '45 days'),

  -- System notifications (5)
  ('cd000001-0001-0001-0001-000000000026'::uuid, 'ca000001-0001-0001-0001-000000000014'::uuid, 'aa000001-0001-0001-0001-000000000040'::uuid, 'res040@example.com', 'email', 'Welcome to Residio Estate, New Resident!', 'Dear New Resident, Welcome to Residio Estate! Your account has been successfully created...', 'delivered', NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days' + INTERVAL '1 minute', NOW() - INTERVAL '60 days' + INTERVAL '10 minutes', NOW() - INTERVAL '60 days' + INTERVAL '11 minutes', NOW() - INTERVAL '60 days'),

  ('cd000001-0001-0001-0001-000000000027'::uuid, 'ca000001-0001-0001-0001-000000000015'::uuid, 'aa000001-0001-0001-0001-000000000003'::uuid, 'res003@example.com', 'email', 'Password Reset Request - Residio Estate', 'Dear Jane Smith, We received a request to reset your password...', 'delivered', NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days' + INTERVAL '30 seconds', NOW() - INTERVAL '30 days' + INTERVAL '2 minutes', NOW() - INTERVAL '30 days' + INTERVAL '3 minutes', NOW() - INTERVAL '30 days'),

  -- Failed notifications (3)
  ('cd000001-0001-0001-0001-000000000028'::uuid, 'ca000001-0001-0001-0001-000000000001'::uuid, 'aa000001-0001-0001-0001-000000000008'::uuid, 'invalid-email@', 'email', 'New Invoice: INV-2025-050', 'Dear Resident, A new invoice has been generated...', 'failed', NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '75 days'),

  ('cd000001-0001-0001-0001-000000000029'::uuid, 'ca000001-0001-0001-0001-000000000004'::uuid, 'aa000001-0001-0001-0001-000000000009'::uuid, '+234invalid', 'sms', NULL, 'RESIDIO: Invoice is overdue...', 'failed', NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '70 days'),

  ('cd000001-0001-0001-0001-000000000030'::uuid, 'ca000001-0001-0001-0001-000000000008'::uuid, 'aa000001-0001-0001-0001-000000000007'::uuid, 'res007@example.com', 'email', 'Visitor Checked In: Unknown', 'Dear Resident, A visitor has checked in...', 'bounced', NULL, NOW() - INTERVAL '50 days', NULL, NULL, NULL, NOW() - INTERVAL '50 days')
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  sent_at = EXCLUDED.sent_at,
  delivered_at = EXCLUDED.delivered_at;


-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
  v_templates INT;
  v_preferences INT;
  v_history INT;
  v_delivered INT;
  v_failed INT;
  v_email INT;
  v_sms INT;
BEGIN
  SELECT COUNT(*) INTO v_templates FROM notification_templates WHERE id::text LIKE 'ca000001%';
  SELECT COUNT(*) INTO v_preferences FROM notification_preferences WHERE id::text LIKE 'cb000001%';
  SELECT COUNT(*) INTO v_history FROM notification_history WHERE id::text LIKE 'cd000001%';

  SELECT COUNT(*) INTO v_delivered FROM notification_history WHERE id::text LIKE 'cd000001%' AND status = 'delivered';
  SELECT COUNT(*) INTO v_failed FROM notification_history WHERE id::text LIKE 'cd000001%' AND status IN ('failed', 'bounced');

  SELECT COUNT(*) INTO v_email FROM notification_history WHERE id::text LIKE 'cd000001%' AND channel = 'email';
  SELECT COUNT(*) INTO v_sms FROM notification_history WHERE id::text LIKE 'cd000001%' AND channel = 'sms';

  RAISE NOTICE '';
  RAISE NOTICE '=== Notifications Fixture Verification ===';
  RAISE NOTICE 'Notification Templates: % (target: 15)', v_templates;
  RAISE NOTICE 'Notification Preferences: % (target: 20)', v_preferences;
  RAISE NOTICE 'Notification History: % (target: 30)', v_history;
  RAISE NOTICE '  By Status:';
  RAISE NOTICE '    - Delivered: %', v_delivered;
  RAISE NOTICE '    - Failed/Bounced: %', v_failed;
  RAISE NOTICE '  By Channel:';
  RAISE NOTICE '    - Email: %', v_email;
  RAISE NOTICE '    - SMS: %', v_sms;
  RAISE NOTICE '==========================================';
END $$;
