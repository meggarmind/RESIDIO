-- ============================================================
-- Chatmaid as a third WhatsApp provider (#401, slice A)
-- ============================================================
-- Chatmaid is a QR-paired WhatsApp Web bridge. It authenticates outbound
-- calls with a single bearer API key and signs its webhooks with a separate
-- signing secret, so it gets its own encrypted columns rather than
-- overloading the Meta- or Twilio-shaped ones.
--
-- Chatmaid's sending number is stored in the existing `whatsapp_from_number`
-- column, as E.164. Config deliberately keys on the E.164 number and NEVER on
-- the Chatmaid dashboard phone id: the same handset has a different phone id
-- in the test and live environments, so a stored id would break on
-- test-to-live promotion.
--
-- Owner decision (2026-09-22): exactly ONE provider is active at a time. This
-- migration keeps the single-active-row design of whatsapp_provider_credentials
-- (idx_whatsapp_provider_credentials_single_active); selecting Chatmaid through
-- replace_whatsapp_credentials retires the active Meta or Twilio row in the
-- same transaction.
--
-- Also adds whatsapp_sessions.paused_until, the human-takeover pause: when an
-- admin types on the connected handset (Chatmaid `message.outgoing`), the
-- Assistant stays quiet for that conversation until this time.
--
-- Secrets are encrypted at rest with AES-256-GCM via src/lib/encryption.ts
-- (DATA_ENCRYPTION_KEY), exactly as for the Meta and Twilio columns.

-- ------------------------------------------------------------
-- 1. Admit 'chatmaid' as a provider
-- ------------------------------------------------------------

ALTER TABLE whatsapp_provider_credentials
  DROP CONSTRAINT IF EXISTS whatsapp_provider_credentials_provider_check;

ALTER TABLE whatsapp_provider_credentials
  ADD CONSTRAINT whatsapp_provider_credentials_provider_check
  CHECK (provider IN ('meta', 'twilio', 'chatmaid'));

-- ------------------------------------------------------------
-- 2. Chatmaid credential columns
-- ------------------------------------------------------------

ALTER TABLE whatsapp_provider_credentials
  ADD COLUMN IF NOT EXISTS chatmaid_api_key_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS chatmaid_webhook_secret_encrypted TEXT;

COMMENT ON COLUMN whatsapp_provider_credentials.chatmaid_api_key_encrypted IS 'AES-256-GCM encrypted Chatmaid API key (Bearer sk_test_* / sk_live_*; the prefix selects the environment)';
COMMENT ON COLUMN whatsapp_provider_credentials.chatmaid_webhook_secret_encrypted IS 'AES-256-GCM encrypted Chatmaid webhook signing secret (verifies X-Chatmaid-Signature)';
COMMENT ON COLUMN whatsapp_provider_credentials.whatsapp_from_number IS 'Sending number in E.164 (Twilio and Chatmaid). Chatmaid config keys on this, never on the environment-scoped dashboard phone id';
COMMENT ON TABLE whatsapp_provider_credentials IS 'Encrypted WhatsApp provider credentials (Meta / Twilio / Chatmaid), admin-managed. Falls back to env vars when no active row exists.';

-- ------------------------------------------------------------
-- 3. replace_whatsapp_credentials: new Chatmaid params
-- ------------------------------------------------------------
-- The signature changes (two new trailing params), so CREATE OR REPLACE
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
  p_actor_id uuid
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
  p_chatmaid_webhook_secret_encrypted TEXT DEFAULT NULL
)
RETURNS whatsapp_provider_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_row whatsapp_provider_credentials;
BEGIN
  IF p_provider NOT IN ('meta', 'twilio', 'chatmaid') THEN
    RAISE EXCEPTION 'Invalid WhatsApp provider: %', p_provider;
  END IF;

  -- Deactivate EVERY active row, not just this provider's. Switching from
  -- Meta to Chatmaid must retire the Meta row in the same transaction, or both
  -- stay active and the live provider becomes ambiguous.
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
    p_actor_id,
    p_actor_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION replace_whatsapp_credentials IS 'Atomically deactivates the current active credential row for a WhatsApp provider and inserts its replacement, so messaging cannot be left with zero active rows mid-rotation.';

-- Service-role only, exactly as in 20260902102528_create_whatsapp_provider_credentials.sql.
-- SECURITY DEFINER bypasses the admin-only RLS on whatsapp_provider_credentials,
-- and a Supabase RPC is directly callable over REST by any JWT holder, so
-- granting EXECUTE to `authenticated` would let any logged-in resident
-- overwrite the estate's WhatsApp credentials. Dropping and recreating the
-- function reset its ACL, so these must be re-issued here.
REVOKE ALL ON FUNCTION replace_whatsapp_credentials FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_whatsapp_credentials TO service_role;

-- ------------------------------------------------------------
-- 4. Human-takeover pause on WhatsApp sessions
-- ------------------------------------------------------------

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.whatsapp_sessions.paused_until IS 'Human-takeover pause: while now() < paused_until the Assistant does not reply in this conversation. Set when an admin types on the connected handset (Chatmaid message.outgoing); NULL means not paused.';

-- ============================================================
-- ROLLBACK
-- ============================================================
-- Restores the exact prior state. Run as one transaction.
--
-- Precondition: no row may have provider = 'chatmaid', or re-adding the old
-- CHECK fails. Deactivating is not enough; such rows must be deleted (after
-- confirming nothing needs them) before rolling back:
--   DELETE FROM whatsapp_provider_credentials WHERE provider = 'chatmaid';
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
--   p_chatmaid_webhook_secret_encrypted text
-- );
--
-- ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS paused_until;
--
-- ALTER TABLE whatsapp_provider_credentials
--   DROP COLUMN IF EXISTS chatmaid_api_key_encrypted,
--   DROP COLUMN IF EXISTS chatmaid_webhook_secret_encrypted;
--
-- ALTER TABLE whatsapp_provider_credentials
--   DROP CONSTRAINT IF EXISTS whatsapp_provider_credentials_provider_check;
-- ALTER TABLE whatsapp_provider_credentials
--   ADD CONSTRAINT whatsapp_provider_credentials_provider_check
--   CHECK (provider IN ('meta', 'twilio'));
--
-- COMMENT ON TABLE whatsapp_provider_credentials IS 'Encrypted WhatsApp provider credentials (Meta / Twilio), admin-managed. Falls back to env vars when no active row exists.';
-- COMMENT ON COLUMN whatsapp_provider_credentials.whatsapp_from_number IS NULL;
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
--   p_actor_id UUID DEFAULT NULL
-- )
-- RETURNS whatsapp_provider_credentials
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public, pg_temp
-- AS $$
-- DECLARE
--   v_row whatsapp_provider_credentials;
-- BEGIN
--   IF p_provider NOT IN ('meta', 'twilio') THEN
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
