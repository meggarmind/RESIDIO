-- ============================================================
-- WhatsApp Provider Credentials
-- ============================================================
-- Moves WhatsApp provider secrets (Meta access token, verify token,
-- app secret; Twilio account SID / auth token reserved for a later
-- issue) out of environment variables and into an encrypted,
-- admin-only table so an estate admin can connect WhatsApp without
-- a redeploy.
--
-- Secrets are encrypted at rest with AES-256-GCM via
-- src/lib/encryption.ts (DATA_ENCRYPTION_KEY). Non-secret WhatsApp
-- config (rollout mode, pilot caps) stays in `system_settings`,
-- whose RLS is readable by any authenticated user — credentials
-- must not live there.

CREATE TABLE IF NOT EXISTS whatsapp_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('meta', 'twilio')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Meta (WhatsApp Cloud API)
  access_token_encrypted TEXT,
  verify_token_encrypted TEXT,
  app_secret_encrypted TEXT,
  phone_number_id TEXT,
  api_version TEXT DEFAULT 'v23.0',
  graph_base_url TEXT DEFAULT 'https://graph.facebook.com',

  -- Twilio (reserved; unused until Twilio provider support ships)
  account_sid_encrypted TEXT,
  auth_token_encrypted TEXT,
  whatsapp_from_number TEXT,
  template_content_sids JSONB,

  -- Timestamps / provenance
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  updated_by UUID REFERENCES profiles(id)
);

-- Only one active credential row per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_provider_credentials_single_active
  ON whatsapp_provider_credentials (provider) WHERE (is_active = TRUE);

-- Comments
COMMENT ON TABLE whatsapp_provider_credentials IS 'Encrypted WhatsApp provider credentials (Meta / Twilio), admin-managed. Falls back to env vars when no active row exists.';
COMMENT ON COLUMN whatsapp_provider_credentials.access_token_encrypted IS 'AES-256-GCM encrypted Meta WhatsApp Cloud API access token';
COMMENT ON COLUMN whatsapp_provider_credentials.verify_token_encrypted IS 'AES-256-GCM encrypted Meta webhook verify token';
COMMENT ON COLUMN whatsapp_provider_credentials.app_secret_encrypted IS 'AES-256-GCM encrypted Meta app secret (used for webhook signature verification)';
COMMENT ON COLUMN whatsapp_provider_credentials.account_sid_encrypted IS 'AES-256-GCM encrypted Twilio account SID (reserved; unused until Twilio support ships)';
COMMENT ON COLUMN whatsapp_provider_credentials.auth_token_encrypted IS 'AES-256-GCM encrypted Twilio auth token (reserved; unused until Twilio support ships)';
COMMENT ON COLUMN whatsapp_provider_credentials.is_active IS 'Only one active credential row per provider (see idx_whatsapp_provider_credentials_single_active)';

-- ============================================================
-- Row Level Security
-- ============================================================
-- Admin-only. Explicitly NOT `USING (true)` like system_settings --
-- these rows hold decryptable secrets and must never be readable by
-- an arbitrary authenticated user.

ALTER TABLE whatsapp_provider_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access for whatsapp provider credentials"
  ON whatsapp_provider_credentials
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman')
    )
  );

-- ============================================================
-- updated_at trigger
-- ============================================================
-- Reuses update_updated_at_column(), defined in
-- 20251222000000_create_rbac_system.sql.

CREATE TRIGGER set_whatsapp_provider_credentials_updated_at
  BEFORE UPDATE ON whatsapp_provider_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- replace_whatsapp_credentials RPC
-- ============================================================
-- Deactivates the existing active row for a provider and inserts the
-- replacement in a single transaction (a plpgsql function body is
-- transactional), so a failure partway through cannot leave the
-- provider with zero active rows and resident messaging dark.

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
  p_actor_id UUID DEFAULT NULL
)
RETURNS whatsapp_provider_credentials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row whatsapp_provider_credentials;
BEGIN
  IF p_provider NOT IN ('meta', 'twilio') THEN
    RAISE EXCEPTION 'Invalid WhatsApp provider: %', p_provider;
  END IF;

  UPDATE whatsapp_provider_credentials
  SET is_active = FALSE,
      updated_at = NOW(),
      updated_by = p_actor_id
  WHERE provider = p_provider
    AND is_active = TRUE;

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
    p_actor_id,
    p_actor_id
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION replace_whatsapp_credentials IS 'Atomically deactivates the current active credential row for a WhatsApp provider and inserts its replacement, so messaging cannot be left with zero active rows mid-rotation.';

-- Service-role only, matching approve_invoice_generation_run in
-- 20260813170000_harden_invoice_generation_run_lifecycle.sql.
--
-- This function is SECURITY DEFINER, so it runs as its owner and bypasses the
-- admin-only RLS on whatsapp_provider_credentials. A Supabase RPC is callable
-- directly over the REST API by any client holding a valid JWT -- it is NOT
-- reachable only through our server action. Granting EXECUTE to `authenticated`
-- would therefore let any logged-in resident overwrite the estate's WhatsApp
-- credentials, defeating the entire point of storing them in a table ordinary
-- users cannot read. The server action's authorizePermission() gate cannot
-- protect a directly-callable RPC.
REVOKE ALL ON FUNCTION replace_whatsapp_credentials FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION replace_whatsapp_credentials TO service_role;
