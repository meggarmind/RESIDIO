-- Add Personnel/Vendors permission category
-- 20260119000100_add_personnel_enum.sql

ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'personnel';
