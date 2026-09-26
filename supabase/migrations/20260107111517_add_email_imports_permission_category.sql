-- Add email_imports permission category enum value
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'email_imports';
