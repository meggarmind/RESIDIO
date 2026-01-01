-- Add new permission categories for Phase 16
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'announcements';
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'notifications';
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'report_subscriptions';
