-- ============================================================
-- Seed whatsapp_enabled (and backstop the retention-day defaults)
-- ============================================================
-- Issue #134: `whatsapp_enabled` is read by
-- src/lib/notifications/send.ts to gate every WhatsApp send, but nothing
-- ever wrote the row -- there was no settings UI and no prior seed. The
-- send-path check used to compare `=== false`, and
-- getSettingValueAsService() returns `null` for a missing row, so an
-- absent row read as `null !== false` and let every send through. That
-- send-path check has been fixed in the same change to fail CLOSED
-- instead (absent or unreadable now blocks sending), which makes seeding
-- this row required, not optional: without it, the new default is
-- "blocked", and this migration is what makes that default explicit
-- rather than implicit.
--
-- Seeding 'false' does not change today's effective behaviour. Nothing
-- can send a WhatsApp message right now regardless of this setting --
-- no provider credentials are configured yet (see
-- whatsapp_provider_credentials / 20260902080000) -- so this only makes
-- the already-true "WhatsApp is off" state explicit and turns the master
-- switch into something an admin can find and flip on
-- /settings/whatsapp, rather than a control that silently did nothing.
--
-- The two retention-day keys are already seeded by
-- 20260824210000_whatsapp_pilot_controls_and_retention.sql; they are
-- repeated here (with ON CONFLICT DO NOTHING, so this is a no-op wherever
-- that migration already ran) purely as a backstop, since #134 also adds
-- a settings-page UI for them and that UI should never hit an estate
-- where the row is missing.
INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('whatsapp_enabled', 'false'::jsonb, 'Master on/off switch for the WhatsApp channel. Distinct from the rollout mode, which chooses who receives -- this decides whether the channel runs at all.', 'notifications'),
  ('whatsapp_session_retention_days', '1'::jsonb, 'Bounded retention for expired WhatsApp sessions', 'notifications'),
  ('whatsapp_processed_message_retention_days', '2'::jsonb, 'Bounded retention for processed WhatsApp webhook IDs', 'notifications')
ON CONFLICT (key) DO NOTHING;
