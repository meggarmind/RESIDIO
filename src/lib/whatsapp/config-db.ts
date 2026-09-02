import { createAdminClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import type {
  MetaWhatsAppConfig,
  TwilioWhatsAppConfig,
  WhatsAppConfig,
} from '@/lib/whatsapp/config';

/**
 * The outcome of reading stored credentials.
 *
 * `absent` and `unusable` are deliberately distinct. Collapsing both into
 * `null` is what makes a decryption failure indistinguishable from "no row
 * configured", and the caller then silently falls back to environment
 * variables — see the note on `getWhatsAppConfig()`.
 */
export type StoredWhatsAppConfig =
  | { status: 'ok'; config: WhatsAppConfig }
  | { status: 'absent' }
  | { status: 'unusable'; reason: string };

/**
 * Loads the active WhatsApp provider configuration from
 * `whatsapp_provider_credentials`, decrypting its secret columns.
 *
 * Uses the admin (service-role) client because callers include the
 * unauthenticated inbound webhook, which cannot satisfy the table's
 * admin-only RLS policy.
 *
 * Never throws into the send/receive path. A row that exists but cannot be
 * used is reported as `unusable` rather than as `absent`, so the caller can
 * refuse to fall back rather than quietly sending with different credentials.
 *
 * Provider selection is not hardcoded: the most recently updated active row
 * wins, whatever provider it names. The partial unique index permits one
 * active row per provider (so a cutover can stage both), and `updated_at`
 * breaks the tie in favour of whichever the admin configured last.
 */
export async function loadWhatsAppConfigFromDb(): Promise<StoredWhatsAppConfig> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('whatsapp_provider_credentials')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // A query failure is NOT "no credentials configured". Falling back to env
    // here would mean a transient database blip silently swaps which
    // credentials the estate sends with.
    console.error('Failed to load WhatsApp provider credentials:', error);
    return { status: 'unusable', reason: 'credential lookup failed' };
  }

  if (!data) {
    return { status: 'absent' };
  }

  try {
    if (data.provider === 'twilio') {
      const accountSid = data.account_sid_encrypted ? decrypt(data.account_sid_encrypted) : '';
      const authToken = data.auth_token_encrypted ? decrypt(data.auth_token_encrypted) : '';

      if (!accountSid || !authToken || !data.whatsapp_from_number) {
        return {
          status: 'unusable',
          reason: 'stored Twilio credentials are missing required fields',
        };
      }

      const config: TwilioWhatsAppConfig = {
        provider: 'twilio',
        accountSid,
        authToken,
        fromNumber: data.whatsapp_from_number,
        templateContentSids: (data.template_content_sids as Record<string, string>) || {},
      };

      return { status: 'ok', config };
    }

    const accessToken = data.access_token_encrypted ? decrypt(data.access_token_encrypted) : '';
    const verifyToken = data.verify_token_encrypted ? decrypt(data.verify_token_encrypted) : '';
    const appSecret = data.app_secret_encrypted ? decrypt(data.app_secret_encrypted) : '';

    if (!accessToken || !verifyToken || !appSecret || !data.phone_number_id) {
      return {
        status: 'unusable',
        reason: 'stored Meta credentials are missing required fields',
      };
    }

    const config: MetaWhatsAppConfig = {
      provider: 'meta',
      accessToken,
      phoneNumberId: data.phone_number_id,
      verifyToken,
      appSecret,
      apiVersion: data.api_version || 'v23.0',
      graphBaseUrl: data.graph_base_url || 'https://graph.facebook.com',
    };

    return { status: 'ok', config };
  } catch (decryptError) {
    // Almost always a rotated or missing DATA_ENCRYPTION_KEY. The row is
    // present and authoritative; we simply cannot read it. Falling back to a
    // stale environment token here would defeat a credential rotation without
    // saying so.
    console.error('Failed to decrypt WhatsApp provider credentials:', decryptError);
    return { status: 'unusable', reason: 'stored credentials could not be decrypted' };
  }
}
