-- Add projects content to permission_category enum
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'projects';
