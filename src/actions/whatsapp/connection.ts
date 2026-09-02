'use server';

/**
 * WhatsApp Provider Connection
 *
 * Lets an admin connect, replace, test, and disconnect the estate's WhatsApp
 * provider (Meta Cloud API or Twilio) without a redeploy. Credentials are
 * encrypted at rest in `whatsapp_provider_credentials` (see the migration
 * `20260902080000_create_whatsapp_provider_credentials.sql`) and written via
 * the `replace_whatsapp_credentials` RPC, which atomically deactivates the
 * previous active row and inserts the replacement.
 *
 * Every write here goes through the admin (service-role) client because the
 * RPC is granted to `service_role` only -- it must not be callable directly
 * over the REST API by an authenticated resident, so `authorizePermission()`
 * is this module's entire authorization boundary. See the migration for why.
 */

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { encrypt, isEncryptionConfigured } from '@/lib/encryption';
import { resolveWhatsAppConfig, invalidateWhatsAppConfigCache } from '@/lib/whatsapp/config';
import { isApprovedWhatsAppTemplateName } from '@/lib/whatsapp/templates';

type ActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

const ENCRYPTION_NOT_CONFIGURED_ERROR =
  'Server encryption key is not configured; contact your deployment administrator';

// ============================================================
// Connection status (read-only, never decrypts anything)
// ============================================================

export type WhatsAppConnectionStatus = {
  connected: boolean;
  provider: 'meta' | 'twilio' | null;
  phoneNumberId: string | null;
  fromNumber: string | null;
  apiVersion: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  hasAccessToken: boolean;
  hasVerifyToken: boolean;
  hasAppSecret: boolean;
  hasAuthToken: boolean;
  // Twilio Content SIDs, keyed by approved template name (see
  // src/lib/whatsapp/templates.ts). Unlike the secret booleans above, these
  // are not sensitive -- a Content SID identifies a template, it does not
  // authenticate anything -- so this returns the actual mapping, not just a
  // "configured" flag.
  templateContentSids: Record<string, string> | null;
};

const DISCONNECTED_STATUS: WhatsAppConnectionStatus = {
  connected: false,
  provider: null,
  phoneNumberId: null,
  fromNumber: null,
  apiVersion: null,
  updatedAt: null,
  updatedByName: null,
  hasAccessToken: false,
  hasVerifyToken: false,
  hasAppSecret: false,
  hasAuthToken: false,
  templateContentSids: null,
};

/**
 * Reports whether WhatsApp is connected and which non-secret fields are set.
 *
 * Deliberately never returns a secret, decrypted or otherwise -- only
 * booleans that a value is present (`hasAccessToken`, etc.), so this is safe
 * to render straight into a settings page.
 */
export async function getWhatsAppConnectionStatus(): Promise<ActionResult<WhatsAppConnectionStatus>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from('whatsapp_provider_credentials')
    .select(
      'provider, phone_number_id, whatsapp_from_number, api_version, updated_at, access_token_encrypted, verify_token_encrypted, app_secret_encrypted, auth_token_encrypted, account_sid_encrypted, template_content_sids, updated_by_profile:profiles!updated_by(full_name)'
    )
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Failed to load WhatsApp connection status:', error);
    return { success: false, data: null, error: 'Failed to load WhatsApp connection status' };
  }

  if (!data) {
    return { success: true, data: DISCONNECTED_STATUS, error: null };
  }

  const updatedByProfile = data.updated_by_profile as
    | { full_name: string | null }
    | { full_name: string | null }[]
    | null;
  const updatedByName = Array.isArray(updatedByProfile)
    ? updatedByProfile[0]?.full_name ?? null
    : updatedByProfile?.full_name ?? null;

  return {
    success: true,
    data: {
      connected: true,
      provider: data.provider as 'meta' | 'twilio',
      phoneNumberId: data.phone_number_id,
      fromNumber: data.whatsapp_from_number,
      apiVersion: data.api_version,
      updatedAt: data.updated_at,
      updatedByName,
      hasAccessToken: Boolean(data.access_token_encrypted),
      hasVerifyToken: Boolean(data.verify_token_encrypted),
      hasAppSecret: Boolean(data.app_secret_encrypted),
      hasAuthToken: Boolean(data.auth_token_encrypted),
      templateContentSids: (data.template_content_sids as Record<string, string> | null) || null,
    },
    error: null,
  };
}

// ============================================================
// Save (replace) credentials
// ============================================================

const metaCredentialsSchema = z.object({
  provider: z.literal('meta'),
  accessToken: z.string().min(1, 'Access token is required'),
  phoneNumberId: z.string().min(1, 'Phone number ID is required'),
  verifyToken: z.string().min(1, 'Verify token is required'),
  appSecret: z.string().min(1, 'App secret is required'),
  apiVersion: z.string().min(1).optional(),
  graphBaseUrl: z.string().url('Graph base URL must be a valid URL').optional(),
});

const twilioCredentialsSchema = z.object({
  provider: z.literal('twilio'),
  accountSid: z.string().min(1, 'Account SID is required'),
  authToken: z.string().min(1, 'Auth token is required'),
  fromNumber: z.string().min(1, 'From number is required'),
  templateContentSids: z.record(z.string(), z.string()).optional(),
});

const saveWhatsAppCredentialsSchema = z.discriminatedUnion('provider', [
  metaCredentialsSchema,
  twilioCredentialsSchema,
]);

export type SaveWhatsAppCredentialsInput = z.infer<typeof saveWhatsAppCredentialsSchema>;

export type SaveWhatsAppCredentialsResult = {
  provider: 'meta' | 'twilio';
  /**
   * The Meta webhook verify token, returned exactly once so the admin can
   * paste it into Meta's console before navigating away. It is never
   * re-readable afterwards -- getWhatsAppConnectionStatus() only ever
   * reports `hasVerifyToken: boolean`, never the value itself. Absent for
   * Twilio, which has no equivalent field.
   */
  verifyToken?: string;
};

/**
 * Replaces the estate's WhatsApp credentials (Meta or Twilio) in one atomic
 * RPC call. Secrets are encrypted before they leave this function; the
 * plaintext values are never written to the audit log.
 */
export async function saveWhatsAppCredentials(
  input: SaveWhatsAppCredentialsInput
): Promise<ActionResult<SaveWhatsAppCredentialsResult>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const parsed = saveWhatsAppCredentialsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      data: null,
      error: parsed.error.issues[0]?.message || 'Invalid WhatsApp credentials',
    };
  }

  // An easy real-world misconfiguration: DATA_ENCRYPTION_KEY is unset or
  // malformed on this deployment. Fail with a clear message rather than
  // throwing out of encrypt() below.
  if (!isEncryptionConfigured()) {
    return { success: false, data: null, error: ENCRYPTION_NOT_CONFIGURED_ERROR };
  }

  const value = parsed.data;
  const adminClient = createAdminClient();

  const rpcParams =
    value.provider === 'meta'
      ? {
          p_provider: 'meta',
          p_access_token_encrypted: encrypt(value.accessToken),
          p_verify_token_encrypted: encrypt(value.verifyToken),
          p_app_secret_encrypted: encrypt(value.appSecret),
          p_phone_number_id: value.phoneNumberId,
          p_api_version: value.apiVersion || 'v23.0',
          p_graph_base_url: value.graphBaseUrl || 'https://graph.facebook.com',
          p_actor_id: authorization.userId,
        }
      : {
          p_provider: 'twilio',
          p_account_sid_encrypted: encrypt(value.accountSid),
          p_auth_token_encrypted: encrypt(value.authToken),
          p_whatsapp_from_number: value.fromNumber,
          p_template_content_sids: value.templateContentSids || null,
          p_actor_id: authorization.userId,
        };

  const { data: row, error } = await adminClient.rpc('replace_whatsapp_credentials', rpcParams);

  if (error) {
    console.error('Failed to save WhatsApp credentials:', error);
    return { success: false, data: null, error: 'Failed to save WhatsApp credentials' };
  }

  const savedRow = row as { id?: string } | null;

  // newValues MUST NEVER contain a plaintext secret (access token, verify
  // token, app secret, auth token). Only non-sensitive facts are logged:
  // provider, phone/from number, and API version.
  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_provider_credentials',
    entityId: savedRow?.id || 'active',
    entityDisplay: `WhatsApp ${value.provider} connection`,
    newValues:
      value.provider === 'meta'
        ? {
            provider: 'meta',
            phoneNumberId: value.phoneNumberId,
            apiVersion: value.apiVersion || 'v23.0',
          }
        : {
            provider: 'twilio',
            fromNumber: value.fromNumber,
          },
  });

  invalidateWhatsAppConfigCache();
  revalidatePath('/settings/whatsapp');

  return {
    success: true,
    data: {
      provider: value.provider,
      ...(value.provider === 'meta' ? { verifyToken: value.verifyToken } : {}),
    },
    error: null,
  };
}

// ============================================================
// Disconnect
// ============================================================

/**
 * Deactivates the active WhatsApp credential row. This is the only
 * supported route back to environment-variable credentials: once no row is
 * active, `resolveWhatsAppConfig()` falls back to `WHATSAPP_*` env vars.
 */
export async function disconnectWhatsApp(): Promise<ActionResult<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: active, error: readError } = await adminClient
    .from('whatsapp_provider_credentials')
    .select('id, provider, phone_number_id, whatsapp_from_number')
    .eq('is_active', true)
    .maybeSingle();

  if (readError) {
    console.error('Failed to look up active WhatsApp connection:', readError);
    return { success: false, data: null, error: 'Failed to look up the active WhatsApp connection' };
  }

  if (!active) {
    return { success: false, data: null, error: 'No active WhatsApp connection to disconnect' };
  }

  const { error } = await adminClient
    .from('whatsapp_provider_credentials')
    .update({ is_active: false, updated_by: authorization.userId })
    .eq('id', active.id);

  if (error) {
    console.error('Failed to disconnect WhatsApp:', error);
    return { success: false, data: null, error: 'Failed to disconnect WhatsApp' };
  }

  await logAudit({
    action: 'DEACTIVATE',
    entityType: 'whatsapp_provider_credentials',
    entityId: active.id,
    entityDisplay: `WhatsApp ${active.provider} connection`,
    oldValues: {
      provider: active.provider,
      phoneNumberId: active.phone_number_id,
      fromNumber: active.whatsapp_from_number,
    },
    newValues: { is_active: false },
  });

  invalidateWhatsAppConfigCache();
  revalidatePath('/settings/whatsapp');

  return { success: true, data: null, error: null };
}

// ============================================================
// Test connection
// ============================================================

export type TestWhatsAppConnectionResult = {
  ok: boolean;
  message: string;
};

/**
 * Makes a lightweight authenticated call to the configured provider to
 * confirm the stored credentials actually work. Gated on WHATSAPP_MANAGE
 * (not VIEW) deliberately: this burns provider quota and can be used to
 * probe whether a guessed token is valid, so viewers must not be able to
 * trigger it.
 *
 * The upstream response body is never returned to the caller -- it can
 * contain token fragments or other sensitive detail. It is logged
 * server-side only; the caller gets a short, generic pass/fail message.
 */
export async function testWhatsAppConnection(): Promise<ActionResult<TestWhatsAppConnectionResult>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const resolved = await resolveWhatsAppConfig();

  if (resolved.status === 'unconfigured') {
    return { success: true, data: { ok: false, message: 'WhatsApp is not configured yet.' }, error: null };
  }
  if (resolved.status === 'unusable') {
    return {
      success: true,
      data: { ok: false, message: 'Stored WhatsApp credentials could not be read. Reconnect to fix this.' },
      error: null,
    };
  }

  const { config } = resolved;

  try {
    if (config.provider === 'meta') {
      const url = `${config.graphBaseUrl}/${config.apiVersion}/${config.phoneNumberId}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.accessToken}` },
        cache: 'no-store',
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error(`WhatsApp Meta connection test failed (HTTP ${response.status}): ${body}`);
        return {
          success: true,
          data: {
            ok: false,
            message: `Meta rejected the request (HTTP ${response.status}). Check the access token and phone number ID.`,
          },
          error: null,
        };
      }

      return { success: true, data: { ok: true, message: 'Connected to the Meta WhatsApp Cloud API.' }, error: null };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`;
    const authHeader = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;
    const response = await fetch(url, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`WhatsApp Twilio connection test failed (HTTP ${response.status}): ${body}`);
      return {
        success: true,
        data: {
          ok: false,
          message: `Twilio rejected the request (HTTP ${response.status}). Check the account SID and auth token.`,
        },
        error: null,
      };
    }

    return { success: true, data: { ok: true, message: 'Connected to the Twilio API.' }, error: null };
  } catch (fetchError) {
    console.error('WhatsApp connection test failed:', fetchError);
    return {
      success: true,
      data: { ok: false, message: 'Could not reach the WhatsApp provider. Check server network access and try again.' },
      error: null,
    };
  }
}

// ============================================================
// Twilio template content SIDs
// ============================================================

/**
 * Updates the Twilio Content SID mapping on the active credentials row,
 * without touching any other field (account SID, auth token, from number).
 *
 * A lighter, targeted update rather than routing through
 * saveWhatsAppCredentials()/replace_whatsapp_credentials deliberately:
 * that RPC requires a full account SID + auth token resubmission (its Zod
 * schema enforces both as non-empty), and those secrets are never sent
 * back to the client to prefill a form with -- see the "Secret fields"
 * comment in connection-settings.tsx. An admin who only wants to update a
 * Content SID should not have to re-enter (or worse, blank out) the
 * account credentials to do it.
 */
export async function updateWhatsAppTemplateContentSids(
  templateContentSids: Record<string, string>
): Promise<ActionResult<null>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  // Template NAMES are not editable through this action -- they are the
  // approved-sender allowlist enforced by isApprovedWhatsAppTemplateName()
  // in src/lib/notifications/send.ts, which only allows a proactive
  // WhatsApp send to use one of the three pre-approved template names.
  // That check is a compliance boundary (WhatsApp Business only allows
  // sending pre-approved templates outside the 24-hour customer service
  // window); if an admin could type an arbitrary key into this JSONB map
  // and it were trusted as a template name, it would let them route an
  // unapproved template through the same send path. So every key supplied
  // here must already be one of the fixed WHATSAPP_TEMPLATE_NAMES -- only
  // which Twilio Content SID is bound to which approved name is
  // admin-editable.
  const entries = Object.entries(templateContentSids);
  for (const [name] of entries) {
    if (!isApprovedWhatsAppTemplateName(name)) {
      return { success: false, data: null, error: `Unknown WhatsApp template name: ${name}` };
    }
  }

  const sanitized: Record<string, string> = {};
  for (const [name, sid] of entries) {
    const trimmed = typeof sid === 'string' ? sid.trim() : '';
    if (trimmed) sanitized[name] = trimmed;
  }

  const adminClient = createAdminClient();
  const { data: active, error: readError } = await adminClient
    .from('whatsapp_provider_credentials')
    .select('id, template_content_sids')
    .eq('is_active', true)
    .maybeSingle();

  if (readError) {
    console.error('Failed to look up active WhatsApp connection:', readError);
    return { success: false, data: null, error: 'Failed to look up the active WhatsApp connection' };
  }
  if (!active) {
    return { success: false, data: null, error: 'No active WhatsApp connection to update' };
  }

  const { error } = await adminClient
    .from('whatsapp_provider_credentials')
    .update({ template_content_sids: sanitized, updated_by: authorization.userId })
    .eq('id', active.id);

  if (error) {
    console.error('Failed to update WhatsApp template content SIDs:', error);
    return { success: false, data: null, error: 'Failed to update WhatsApp template content SIDs' };
  }

  // Not a secret (see the WhatsAppConnectionStatus.templateContentSids
  // comment) -- safe to record the full mapping, unlike saveWhatsAppCredentials()
  // above which must never put a plaintext secret in newValues.
  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_provider_credentials',
    entityId: active.id,
    entityDisplay: 'WhatsApp Twilio template content SIDs',
    oldValues: { templateContentSids: active.template_content_sids },
    newValues: { templateContentSids: sanitized },
  });

  invalidateWhatsAppConfigCache();
  revalidatePath('/settings/whatsapp');

  return { success: true, data: null, error: null };
}
