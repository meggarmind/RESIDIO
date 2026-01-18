-- Add finance to permission_category enum to support expenditure permissions
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'finance';
