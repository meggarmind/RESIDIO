-- Add 'notes' to the permission_category enum
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'notes';
