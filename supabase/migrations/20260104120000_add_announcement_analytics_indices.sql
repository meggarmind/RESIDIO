-- Migration: Add performance indices for announcement analytics and scheduled publishing
-- Description: Optimizes queries for cron job, analytics dashboard, and notification center

-- Index for scheduled announcement cron job queries
-- Enables fast lookup of announcements ready to publish
CREATE INDEX IF NOT EXISTS idx_announcements_status_scheduled
ON announcements(status, scheduled_for)
WHERE status = 'scheduled';

-- Index for analytics queries filtering by published status and date
-- Speeds up time-range queries for dashboard
CREATE INDEX IF NOT EXISTS idx_announcements_published_date
ON announcements(status, published_at)
WHERE status = 'published';

-- Index for announcement category joins in analytics
-- Optimizes category engagement calculations
CREATE INDEX IF NOT EXISTS idx_announcements_category
ON announcements(category_id)
WHERE category_id IS NOT NULL;

-- Index for read receipt aggregations
-- Speeds up engagement rate calculations
CREATE INDEX IF NOT EXISTS idx_read_receipts_announcement
ON announcement_read_receipts(announcement_id);

-- Composite index for read receipt counting
-- Optimizes unread count queries
CREATE INDEX IF NOT EXISTS idx_read_receipts_announcement_resident
ON announcement_read_receipts(announcement_id, resident_id);

-- Index for notification center queries
-- Enables fast filtering by recipient, category, and read status
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_category
ON in_app_notifications(recipient_id, category, is_read)
WHERE expires_at IS NULL OR expires_at > NOW();

-- Index for notification center date sorting
-- Optimizes "recent notifications" queries
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
ON in_app_notifications(recipient_id, created_at DESC)
WHERE expires_at IS NULL OR expires_at > NOW();

-- Index for unread notification counts
-- Speeds up badge queries in portal header
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
ON in_app_notifications(recipient_id)
WHERE is_read = false AND (expires_at IS NULL OR expires_at > NOW());

-- Comment documentation
COMMENT ON INDEX idx_announcements_status_scheduled IS 
'Optimizes cron job queries for scheduled announcements ready to publish';

COMMENT ON INDEX idx_announcements_published_date IS 
'Optimizes analytics dashboard queries filtering published announcements by date range';

COMMENT ON INDEX idx_read_receipts_announcement IS 
'Speeds up engagement rate calculations by announcement';

COMMENT ON INDEX idx_notifications_recipient_category IS 
'Optimizes notification center filtering by category and read status';
