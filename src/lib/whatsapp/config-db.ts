import { createAdminClient } from '@/lib/supabase/server';
import { decrypt } from '@/lib/encryption';
import type { MetaWhatsAppConfig, WhatsAppConfig } from '@/lib/whatsapp/config';

/**
 * Loads the active WhatsApp provider configuration from
 * `whatsapp_provider_credentials`, decrypting its secret columns.
 *
 * Uses the admin (service-role) client because callers include the
 * unauthenticated inbound webhook, which cannot satisfy the table's
 * admin-only RLS policy.
 *
 * Returns `null` when there is no active row, or when decryption
 * fails (misconfigured/rotated DATA_ENCRYPTION_KEY) — this must
 * never throw into the send/receive path, so failures are logged
 * and swallowed here.
 */
export async function loadWhatsAppConfigFromDb(): Promise<WhatsAppConfig | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('whatsapp_provider_credentials')
    .select('*')
    .eq('is_active', true)
    .eq('provider', 'meta')
    .maybeSingle();

  if (error) {
    console.error('Failed to load WhatsApp provider credentials:', error);
    return null;
  }

  if (!data) {
    return null;
  }

  try {
    const accessToken = data.access_token_encrypted ? decrypt(data.access_token_encrypted) : '';
    const verifyToken = data.verify_token_encrypted ? decrypt(data.verify_token_encrypted) : '';
    const appSecret = data.app_secret_encrypted ? decrypt(data.app_secret_encrypted) : '';

    if (!accessToken || !verifyToken || !appSecret || !data.phone_number_id) {
      console.error('WhatsApp provider credentials row is missing required fields');
      return null;
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

    return config;
  } catch (decryptError) {
    console.error('Failed to decrypt WhatsApp provider credentials:', decryptError);
    return null;
  }
}
