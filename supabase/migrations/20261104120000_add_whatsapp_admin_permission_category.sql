-- Add whatsapp_admin to permission_category for the WhatsApp Admin tools menu items (#1292).
-- Its own migration: a new enum value cannot be used in the transaction that adds it.
--
-- Rollback: none needed. An unused enum value is harmless, and Postgres cannot drop one.
ALTER TYPE public.permission_category ADD VALUE IF NOT EXISTS 'whatsapp_admin';
