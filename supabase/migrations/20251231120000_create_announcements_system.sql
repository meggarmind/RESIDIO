-- Phase 16: Community Communication System
-- Creates announcements, in-app notifications, message templates, and report subscriptions

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Announcement status
CREATE TYPE announcement_status AS ENUM ('draft', 'scheduled', 'published', 'archived');

-- Announcement priority
CREATE TYPE announcement_priority AS ENUM ('low', 'normal', 'high', 'emergency');

-- Target audience for announcements
CREATE TYPE target_audience AS ENUM ('all', 'residents', 'owners', 'tenants', 'staff');


-- ============================================================================
-- TABLE 1: announcement_categories
-- ============================================================================

CREATE TABLE announcement_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  color TEXT DEFAULT 'blue',
  display_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for ordering
CREATE INDEX idx_announcement_categories_order ON announcement_categories(display_order, name);

-- Enable RLS
ALTER TABLE announcement_categories ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TABLE 2: announcements
-- ============================================================================

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT,
  category_id UUID REFERENCES announcement_categories(id) ON DELETE SET NULL,
  status announcement_status DEFAULT 'draft',
  priority announcement_priority DEFAULT 'normal',
  target_audience target_audience DEFAULT 'all',
  target_houses UUID[], -- Array of house IDs for targeted announcements
  is_pinned BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  attachment_urls TEXT[],
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_announcements_status ON announcements(status);
CREATE INDEX idx_announcements_priority ON announcements(priority);
CREATE INDEX idx_announcements_published_at ON announcements(published_at DESC NULLS LAST);
CREATE INDEX idx_announcements_scheduled_for ON announcements(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_announcements_category ON announcements(category_id);
CREATE INDEX idx_announcements_pinned ON announcements(is_pinned) WHERE is_pinned = true;

-- Enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TABLE 3: announcement_read_receipts
-- ============================================================================

CREATE TABLE announcement_read_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(announcement_id, resident_id)
);

-- Index for quick lookup
CREATE INDEX idx_announcement_read_receipts_announcement ON announcement_read_receipts(announcement_id);
CREATE INDEX idx_announcement_read_receipts_resident ON announcement_read_receipts(resident_id);

-- Enable RLS
ALTER TABLE announcement_read_receipts ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TABLE 4: in_app_notifications
-- ============================================================================

CREATE TABLE in_app_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  category TEXT NOT NULL, -- e.g., 'announcement', 'payment', 'security', 'system'
  entity_type TEXT, -- e.g., 'announcement', 'invoice', 'access_log'
  entity_id UUID, -- Link to the related entity
  action_url TEXT, -- Where to navigate when clicked
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX idx_in_app_notifications_recipient ON in_app_notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX idx_in_app_notifications_unread ON in_app_notifications(recipient_id, created_at DESC) WHERE is_read = false;
CREATE INDEX idx_in_app_notifications_category ON in_app_notifications(recipient_id, category);

-- Enable RLS
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TABLE 5: message_templates
-- ============================================================================

CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID REFERENCES announcement_categories(id) ON DELETE SET NULL,
  title_template TEXT NOT NULL,
  content_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- Array of { name, description, required }
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for active templates
CREATE INDEX idx_message_templates_active ON message_templates(is_active, name);
CREATE INDEX idx_message_templates_category ON message_templates(category_id);

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TABLE 6: report_subscriptions (Deferred Prompt Feature)
-- ============================================================================

CREATE TABLE report_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE UNIQUE,
  -- Financial report preferences
  receive_monthly_summary BOOLEAN DEFAULT false,
  receive_quarterly_report BOOLEAN DEFAULT false,
  receive_payment_confirmation BOOLEAN DEFAULT true,
  receive_invoice_reminder BOOLEAN DEFAULT true,
  -- Delivery channel preferences
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  -- Scheduling preferences
  preferred_day_of_month INT DEFAULT 1 CHECK (preferred_day_of_month BETWEEN 1 AND 28),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for finding residents with specific preferences
CREATE INDEX idx_report_subscriptions_monthly ON report_subscriptions(receive_monthly_summary) WHERE receive_monthly_summary = true;
CREATE INDEX idx_report_subscriptions_quarterly ON report_subscriptions(receive_quarterly_report) WHERE receive_quarterly_report = true;

-- Enable RLS
ALTER TABLE report_subscriptions ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- TRIGGERS: updated_at
-- ============================================================================

-- announcement_categories
CREATE TRIGGER update_announcement_categories_updated_at
  BEFORE UPDATE ON announcement_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- announcements
CREATE TRIGGER update_announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- message_templates
CREATE TRIGGER update_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- report_subscriptions
CREATE TRIGGER update_report_subscriptions_updated_at
  BEFORE UPDATE ON report_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- RLS POLICIES: announcement_categories
-- ============================================================================

-- Anyone authenticated can view active categories
CREATE POLICY "announcement_categories_select_policy"
  ON announcement_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admin and Chairman can manage categories
CREATE POLICY "announcement_categories_admin_all"
  ON announcement_categories FOR ALL
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


-- ============================================================================
-- RLS POLICIES: announcements
-- ============================================================================

-- Admins and management roles can view all announcements
CREATE POLICY "announcements_admin_select"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
    )
  );

-- Residents can view published, non-expired announcements
CREATE POLICY "announcements_resident_select"
  ON announcements FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      -- User is a resident
      EXISTS (
        SELECT 1 FROM residents r
        WHERE r.profile_id = auth.uid()
        AND r.account_status = 'active'
      )
    )
    AND (
      -- Target audience check
      target_audience = 'all'
      OR (
        target_audience = 'residents' AND EXISTS (
          SELECT 1 FROM residents r
          WHERE r.profile_id = auth.uid() AND r.account_status = 'active'
        )
      )
      OR (
        target_audience = 'owners' AND EXISTS (
          SELECT 1 FROM residents r
          JOIN resident_houses rh ON rh.resident_id = r.id
          WHERE r.profile_id = auth.uid()
          AND r.account_status = 'active'
          AND rh.is_active = true
          AND rh.resident_role IN ('resident_landlord', 'non_resident_landlord')
        )
      )
      OR (
        target_audience = 'tenants' AND EXISTS (
          SELECT 1 FROM residents r
          JOIN resident_houses rh ON rh.resident_id = r.id
          WHERE r.profile_id = auth.uid()
          AND r.account_status = 'active'
          AND rh.is_active = true
          AND rh.resident_role = 'tenant'
        )
      )
      OR (
        target_audience = 'staff' AND EXISTS (
          SELECT 1 FROM residents r
          JOIN resident_houses rh ON rh.resident_id = r.id
          WHERE r.profile_id = auth.uid()
          AND r.account_status = 'active'
          AND rh.is_active = true
          AND rh.resident_role IN ('domestic_staff', 'caretaker', 'contractor')
        )
      )
    )
    AND (
      -- Targeted houses check (if specified)
      target_houses IS NULL
      OR array_length(target_houses, 1) IS NULL
      OR EXISTS (
        SELECT 1 FROM residents r
        JOIN resident_houses rh ON rh.resident_id = r.id
        WHERE r.profile_id = auth.uid()
        AND r.account_status = 'active'
        AND rh.is_active = true
        AND rh.house_id = ANY(target_houses)
      )
    )
  );

-- Admin and Chairman can insert announcements
CREATE POLICY "announcements_admin_insert"
  ON announcements FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman')
    )
  );

-- Admin and Chairman can update announcements
CREATE POLICY "announcements_admin_update"
  ON announcements FOR UPDATE
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

-- Admin can delete announcements
CREATE POLICY "announcements_admin_delete"
  ON announcements FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );


-- ============================================================================
-- RLS POLICIES: announcement_read_receipts
-- ============================================================================

-- Users can view their own read receipts
CREATE POLICY "read_receipts_own_select"
  ON announcement_read_receipts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  );

-- Admin can view all read receipts (for analytics)
CREATE POLICY "read_receipts_admin_select"
  ON announcement_read_receipts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman')
    )
  );

-- Users can insert their own read receipts
CREATE POLICY "read_receipts_own_insert"
  ON announcement_read_receipts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  );


-- ============================================================================
-- RLS POLICIES: in_app_notifications
-- ============================================================================

-- Users can view their own notifications
CREATE POLICY "in_app_notifications_own_select"
  ON in_app_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = recipient_id
      AND r.profile_id = auth.uid()
    )
  );

-- Users can update (mark as read) their own notifications
CREATE POLICY "in_app_notifications_own_update"
  ON in_app_notifications FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = recipient_id
      AND r.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = recipient_id
      AND r.profile_id = auth.uid()
    )
  );

-- System/Admin can insert notifications for any user
CREATE POLICY "in_app_notifications_admin_insert"
  ON in_app_notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
    )
  );

-- Users can delete their own notifications
CREATE POLICY "in_app_notifications_own_delete"
  ON in_app_notifications FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = recipient_id
      AND r.profile_id = auth.uid()
    )
  );


-- ============================================================================
-- RLS POLICIES: message_templates
-- ============================================================================

-- Anyone authenticated can view active templates
CREATE POLICY "message_templates_select_policy"
  ON message_templates FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admin and Chairman can manage templates
CREATE POLICY "message_templates_admin_all"
  ON message_templates FOR ALL
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


-- ============================================================================
-- RLS POLICIES: report_subscriptions
-- ============================================================================

-- Users can view their own subscription
CREATE POLICY "report_subscriptions_own_select"
  ON report_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  );

-- Admin can view all subscriptions
CREATE POLICY "report_subscriptions_admin_select"
  ON report_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'admin'
    )
  );

-- Users can insert their own subscription
CREATE POLICY "report_subscriptions_own_insert"
  ON report_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  );

-- Users can update their own subscription
CREATE POLICY "report_subscriptions_own_update"
  ON report_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM residents r
      WHERE r.id = resident_id
      AND r.profile_id = auth.uid()
    )
  );


-- ============================================================================
-- SEED DATA: Default Categories
-- ============================================================================

INSERT INTO announcement_categories (name, slug, description, icon, color, display_order, is_active)
VALUES
  ('General', 'general', 'General estate announcements and updates', 'megaphone', 'blue', 1, true),
  ('Maintenance', 'maintenance', 'Scheduled maintenance and infrastructure updates', 'wrench', 'orange', 2, true),
  ('Security', 'security', 'Security alerts and safety notices', 'shield', 'red', 3, true),
  ('Events', 'events', 'Community events and social gatherings', 'calendar', 'purple', 4, true),
  ('Finance', 'finance', 'Financial updates, levy changes, and payment reminders', 'banknote', 'green', 5, true);


-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE announcement_categories IS 'Categories for organizing announcements';
COMMENT ON TABLE announcements IS 'Estate announcements and notices';
COMMENT ON TABLE announcement_read_receipts IS 'Tracks which residents have read which announcements';
COMMENT ON TABLE in_app_notifications IS 'In-app notification inbox for residents';
COMMENT ON TABLE message_templates IS 'Reusable templates for announcements';
COMMENT ON TABLE report_subscriptions IS 'Resident preferences for financial report notifications';

COMMENT ON TYPE announcement_status IS 'Lifecycle status of an announcement';
COMMENT ON TYPE announcement_priority IS 'Priority level of an announcement';
COMMENT ON TYPE target_audience IS 'Target audience for announcements';
