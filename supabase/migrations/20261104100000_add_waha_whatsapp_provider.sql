-- ============================================================
-- WAHA as a fourth WhatsApp provider (#1262)
-- ============================================================
-- WAHA (WhatsApp HTTP API) is a self-hosted WhatsApp Web bridge. Like Chatmaid
-- it is QR-paired, authenticates outbound calls with one API key (header
-- X-Api-Key) and signs its webhooks with a separate HMAC secret. Unlike
-- Chatmaid it runs on a host the estate owns, so the base URL and the session
-- name are per-estate settings rather than constants.
--
-- The sending number is stored in the existing `whatsapp_from_number` column,
-- as E.164, exactly as for Twilio and Chatmaid.
--
-- Owner decision (2026-09-22) still holds: exactly ONE provider is active at a
-- time. This migration keeps the single-active-row design of
-- whatsapp_provider_credentials; selecting WAHA through
-- replace_whatsapp_credentials retires the active row of any other provider in
-- the same transaction.
--
-- Secrets are encrypted at rest with AES-256-GCM via src/lib/encryption.ts
-- (DATA_ENCRYPTION_KEY), exactly as for the Meta, Twilio and Chatmaid columns.
-- The base URL and the session name are not secrets and are stored in clear.

-- ------------------------------------------------------------
-- 1. Admit 'waha' as a provider
-- ------------------------------------------------------------

ALTER TABLE whatsapp_provider_credentials
  DROP CONSTRAINT IF EXISTS whatsapp_provider_credentials_provider_check;

ALTER TABLE whatsapp_provider_credentials
  ADD CONSTRAINT whatsapp_provider_credentials_provider_check
  CHECK (provider IN ('meta', 'twilio', 'chatmaid', 'waha'));

-- ------------------------------------------------------------
-- 2. WAHA credential columns
-- ------------------------------------------------------------

ALTER TABLE whatsapp_provider_credentials
  ADD COLUMN IF NOT EXISTS waha_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS waha_webhook_secret_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS waha_base_url TEXT,
  ADD COLUMN IF NOT EXISTS waha_session TEXT;

COMMENT ON COLUMN whatsapp_provider_credentials.waha_api_key_encrypted IS 'AES-256-GCM encrypted WAHA API key (sent as the X-Api-Key header)';
COMMENT ON COLUMN whatsapp_provider_credentials.waha_webhook_secret_encrypted IS 'AES-256-GCM encrypted WAHA webhook HMAC secret (verifies X-Webhook-Hmac, HMAC-SHA512 over the raw body)';
COMMENT ON COLUMN whatsapp_provider_credentials.waha_base_url IS 'WAHA server base URL, https, no trailing slash (not a secret)';
COMMENT ON COLUMN whatsapp_provider_credentials.waha_session IS 'WAHA session name the estate sends and receives on (not a secret)';
COMMENT ON COLUMN whatsapp_provider_credentials.whatsapp_from_number IS 'Sending number in E.164 (Twilio, Chatmaid and WAHA). Chatmaid and WAHA config key on this number, never on a provider-side phone id';
COMMENT ON TABLE whatsapp_provider_credentials IS 'Encrypted WhatsApp provider credentials (Meta / Twilio / Chatmaid / WAHA), admin-managed. Falls back to env vars when no active row exists.';

-- ------------------------------------------------------------
-- 3. replace_whatsapp_credentials: new WAHA params
-- ------------------------------------------------------------
-- The signature changes (four new trailing params), so CREATE OR REPLACE
-- would create an overload beside the old function rather than replace it.
-- Drop the old signature first.

DROP FUNCTION IF EXISTS replace_whatsapp_credentials(
  p_provider text,
  p_access_token_encrypted text,
  p_verify_token_encrypted text,
  p_app_secret_encrypted text,
  p_phone_number_id text,
  p_api_version text,
  p_graph_base_url text,
  p_account_sid_encrypted text,
  p_auth_token_encrypted text,
  p_whatsapp_from_number text,
  p_template_content_sids jsonb,
  p_actor_id uuid,
  p_chatmaid_api_key_encrypted text,
  p_chatmaid_webhook_secret_encrypted text
);

CREATE OR REPLACE FUNCTION replace_whatsapp_credentials(
  p_provider TEXT,
  p_access_token_encrypted TEXT DEFAULT NULL,
  p_verify_token_encrypted TEXT DEFAULT NULL,
  p_app_secret_encrypted TEXT DEFAULT NULL,
  p_phone_number_id TEXT DEFAULT NULL,
  p_api_version TEXT DEFAULT 'v23.0',
  p_graph_base_url TEXT DEFAULT 'https://graph.facebook.com',
  p_account_sid_encrypted TEXT DEFAULT NULL,
  p_auth_token_encrypted TEXT DEFAULT NULL,
  p_whatsapp_from_number TEXT DEFAULT NULL,
  p_template_content_sids JSONB DEFAULT NULL,
  p_actor_id UUID DEFAULT NULL,
  p_chatmaid_api_key_encrypted TEXT DEFAULT NULL,
  p_chatmaid_webhook_secret_encrypted TEXT DEFAULT NULL,
  p_waha_api_key_encrypted TEXT DEFAULT NULL,
  p_waha_webhook_secret_encrypted TEXT DEFAULT NULL,
  p_waha_base_url TEXT DEFAULT NULL,
  p_waha_session TEXT DEFAULT NULL
)
RETURNS whatsapp_provider_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row whatsapp_provider_credentials;
BEGIN
  IF p_provider NOT IN ('meta', 'twilio', 'chatmaid', 'waha') THEN
    RAISE EXCEPTION 'Invalid WhatsApp provider: %', p_provider;
  END IF;

  -- Deactivate EVERY active row, not just this provider's. Switching from
  -- Chatmaid to WAHA must retire the Chatmaid row in the same transaction, or
  -- both stay active and the live provider becomes ambiguous.
  UPDATE whatsapp_provider_credentials
  SET is_active = FALSE,
      updated_at = NOW(),
      updated_by = p_actor_id
  WHERE is_active = TRUE;

  INSERT INTO whatsapp_provider_credentials (
    provider,
    is_active,
    access_token_encrypted,
    verify_token_encrypted,
    app_secret_encrypted,
    phone_number_id,
    api_version,
    graph_base_url,
    account_sid_encrypted,
    auth_token_encrypted,
    whatsapp_from_number,
    template_content_sids,
    chatmaid_api_key_encrypted,
    chatmaid_webhook_secret_encrypted,
    waha_api_key_encrypted,
    waha_webhook_secret_encrypted,
    waha_base_url,
    waha_session,
    created_by,
    updated_by
  ) VALUES (
    p_provider,
    TRUE,
    p_access_token_encrypted,
    p_verify_token_encrypted,
    p_app_secret_encrypted,
    p_phone_number_id,
    COALESCE(p_api_version, 'v23.0'),
    COALESCE(p_graph_base_url, 'https://graph.facebook.com'),
    p_account_sid_encrypted,
    p_auth_token_encrypted,
    p_whatsapp_from_number,
    p_template_content_sids,
    p_chatmaid_api_key_encrypted,
    p_chatmaid_webhook_secret_encrypted,
    p_waha_api_key_encrypted,
    p_waha_webhook_secret_encrypted,
    p_waha_base_url,
    p_waha_session,
    p_actor_id,
    p_actor_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION replace_whatsapp_credentials IS 'Atomically deactivates the current active credential row for a WhatsApp provider and inserts its replacement, so messaging cannot be left with zero active rows mid-rotation.';

-- Service-role only, exactly as in 20260902102528_create_whatsapp_provider_credentials.sql
-- and 20260922100000_add_chatmaid_whatsapp_provider.sql. SECURITY DEFINER
-- bypasses the admin-only RLS on whatsapp_provider_credentials, and a Supabase
-- RPC is directly callable over REST by any JWT holder, so granting EXECUTE to
-- `authenticated` would let any logged-in resident overwrite the estate's
-- WhatsApp credentials. Dropping and recreating the function reset its ACL, so
-- these must be re-issued here.
REVOKE ALL ON FUNCTION replace_whatsapp_credentials FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_whatsapp_credentials TO service_role;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Restores the exact prior state (the Chatmaid migration's end state). Run as
-- one transaction.
--
-- Precondition: no row may have provider = 'waha', or re-adding the old CHECK
-- fails. Deactivating is not enough; such rows must be deleted (after
-- confirming nothing needs them) before rolling back:
--   DELETE FROM whatsapp_provider_credentials WHERE provider = 'waha';
--
-- BEGIN;
--
-- DROP FUNCTION IF EXISTS replace_whatsapp_credentials(
--   p_provider text,
--   p_access_token_encrypted text,
--   p_verify_token_encrypted text,
--   p_app_secret_encrypted text,
--   p_phone_number_id text,
--   p_api_version text,
--   p_graph_base_url text,
--   p_account_sid_encrypted text,
--   p_auth_token_encrypted text,
--   p_whatsapp_from_number text,
--   p_template_content_sids jsonb,
--   p_actor_id uuid,
--   p_chatmaid_api_key_encrypted text,
--   p_chatmaid_webhook_secret_encrypted text,
--   p_waha_api_key_encrypted text,
--   p_waha_webhook_secret_encrypted text,
--   p_waha_base_url text,
--   p_waha_session text
-- );
--
-- ALTER TABLE whatsapp_provider_credentials
--   DROP COLUMN IF EXISTS waha_api_key_encrypted,
--   DROP COLUMN IF EXISTS waha_webhook_secret_encrypted,
--   DROP COLUMN IF EXISTS waha_base_url,
--   DROP COLUMN IF EXISTS waha_session;
--
-- ALTER TABLE whatsapp_provider_credentials
--   DROP CONSTRAINT IF EXISTS whatsapp_provider_credentials_provider_check;
-- ALTER TABLE whatsapp_provider_credentials
--   ADD CONSTRAINT whatsapp_provider_credentials_provider_check
--   CHECK (provider IN ('meta', 'twilio', 'chatmaid'));
--
-- COMMENT ON TABLE whatsapp_provider_credentials IS 'Encrypted WhatsApp provider credentials (Meta / Twilio / Chatmaid), admin-managed. Falls back to env vars when no active row exists.';
-- COMMENT ON COLUMN whatsapp_provider_credentials.whatsapp_from_number IS 'Sending number in E.164 (Twilio and Chatmaid). Chatmaid config keys on this, never on the environment-scoped dashboard phone id';
--
-- CREATE OR REPLACE FUNCTION replace_whatsapp_credentials(
--   p_provider TEXT,
--   p_access_token_encrypted TEXT DEFAULT NULL,
--   p_verify_token_encrypted TEXT DEFAULT NULL,
--   p_app_secret_encrypted TEXT DEFAULT NULL,
--   p_phone_number_id TEXT DEFAULT NULL,
--   p_api_version TEXT DEFAULT 'v23.0',
--   p_graph_base_url TEXT DEFAULT 'https://graph.facebook.com',
--   p_account_sid_encrypted TEXT DEFAULT NULL,
--   p_auth_token_encrypted TEXT DEFAULT NULL,
--   p_whatsapp_from_number TEXT DEFAULT NULL,
--   p_template_content_sids JSONB DEFAULT NULL,
--   p_actor_id UUID DEFAULT NULL,
--   p_chatmaid_api_key_encrypted TEXT DEFAULT NULL,
--   p_chatmaid_webhook_secret_encrypted TEXT DEFAULT NULL
-- )
-- RETURNS whatsapp_provider_credentials
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'
-- AS $$
-- DECLARE
--   v_row whatsapp_provider_credentials;
-- BEGIN
--   IF p_provider NOT IN ('meta', 'twilio', 'chatmaid') THEN
--     RAISE EXCEPTION 'Invalid WhatsApp provider: %', p_provider;
--   END IF;
--
--   UPDATE whatsapp_provider_credentials
--   SET is_active = FALSE,
--       updated_at = NOW(),
--       updated_by = p_actor_id
--   WHERE is_active = TRUE;
--
--   INSERT INTO whatsapp_provider_credentials (
--     provider,
--     is_active,
--     access_token_encrypted,
--     verify_token_encrypted,
--     app_secret_encrypted,
--     phone_number_id,
--     api_version,
--     graph_base_url,
--     account_sid_encrypted,
--     auth_token_encrypted,
--     whatsapp_from_number,
--     template_content_sids,
--     chatmaid_api_key_encrypted,
--     chatmaid_webhook_secret_encrypted,
--     created_by,
--     updated_by
--   ) VALUES (
--     p_provider,
--     TRUE,
--     p_access_token_encrypted,
--     p_verify_token_encrypted,
--     p_app_secret_encrypted,
--     p_phone_number_id,
--     COALESCE(p_api_version, 'v23.0'),
--     COALESCE(p_graph_base_url, 'https://graph.facebook.com'),
--     p_account_sid_encrypted,
--     p_auth_token_encrypted,
--     p_whatsapp_from_number,
--     p_template_content_sids,
--     p_chatmaid_api_key_encrypted,
--     p_chatmaid_webhook_secret_encrypted,
--     p_actor_id,
--     p_actor_id
--   )
--   RETURNING * INTO v_row;
--
--   RETURN v_row;
-- END;
-- $$;
--
-- COMMENT ON FUNCTION replace_whatsapp_credentials IS 'Atomically deactivates the current active credential row for a WhatsApp provider and inserts its replacement, so messaging cannot be left with zero active rows mid-rotation.';
--
-- REVOKE ALL ON FUNCTION replace_whatsapp_credentials FROM PUBLIC, anon, authenticated;
-- GRANT EXECUTE ON FUNCTION replace_whatsapp_credentials TO service_role;
--
-- COMMIT;
