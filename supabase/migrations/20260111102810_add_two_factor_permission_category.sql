-- Add two_factor permission category enum value
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'two_factor';
