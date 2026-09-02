import { loadWhatsAppConfigFromDb } from '@/lib/whatsapp/config-db';

export interface MetaWhatsAppConfig {
  provider: 'meta';
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  appSecret: string;
  apiVersion: string;
  graphBaseUrl: string;
}

export interface TwilioWhatsAppConfig {
  provider: 'twilio';
  accountSid: string;
  authToken: string;
  fromNumber: string;
  templateContentSids: Record<string, string>;
}

export type WhatsAppConfig = MetaWhatsAppConfig | TwilioWhatsAppConfig;

/**
 * Why this is a result type rather than `WhatsAppConfig | null`:
 *
 * `unconfigured` (nothing set up anywhere) and `unusable` (credentials are
 * stored but cannot be read) need different handling. Returning `null` for
 * both is the bug filed as #136 in another part of this codebase, where
 * `getSettingValue` returns `null` for absent-row, not-authenticated and
 * query-errored alike.
 */
export type WhatsAppConfigResult =
  | { status: 'ok'; config: WhatsAppConfig }
  | { status: 'unconfigured' }
  | { status: 'unusable'; reason: string };

const CACHE_TTL_MS = 30_000;

let cachedResult: WhatsAppConfigResult | null = null;
let cachedAt = 0;

function getWhatsAppConfigFromEnv(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!accessToken || !phoneNumberId || !verifyToken || !appSecret) {
    return null;
  }

  return {
    provider: 'meta',
    accessToken,
    phoneNumberId,
    verifyToken,
    appSecret,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v23.0',
    graphBaseUrl: process.env.WHATSAPP_GRAPH_BASE_URL || 'https://graph.facebook.com',
  };
}

/**
 * Resolves the active WhatsApp provider configuration.
 *
 * Resolution order:
 * 1. A 30s in-process cache, so a batch send does not re-decrypt per message
 *    and the public webhook does not hit the database on every POST. Negative
 *    results are cached too — an unconfigured estate is the common case and
 *    must not cost a query per inbound request.
 * 2. The `whatsapp_provider_credentials` table. An active row wins outright
 *    and is returned as-is; fields are never merged across sources.
 * 3. Environment variables, for estates that have not migrated yet.
 *
 * The environment fallback fires ONLY when no row exists. If a row exists but
 * cannot be used — decrypt failure, missing fields, failed lookup — this
 * returns `unusable` and does NOT fall back. A credential you cannot decrypt
 * is not the same as a credential you do not have: falling back there would
 * silently send with a superseded token (defeating a rotation), or verify
 * inbound signatures against the wrong app secret so every reply is dropped.
 * Fail closed and say why.
 */
export async function resolveWhatsAppConfig(): Promise<WhatsAppConfigResult> {
  const now = Date.now();
  if (cachedResult !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const stored = await loadWhatsAppConfigFromDb();

  let result: WhatsAppConfigResult;
  if (stored.status === 'ok') {
    result = { status: 'ok', config: stored.config };
  } else if (stored.status === 'unusable') {
    result = { status: 'unusable', reason: stored.reason };
  } else {
    const envConfig = getWhatsAppConfigFromEnv();
    result = envConfig ? { status: 'ok', config: envConfig } : { status: 'unconfigured' };
  }

  cachedResult = result;
  cachedAt = now;

  return result;
}

/**
 * Convenience wrapper for callers that cannot act differently on `unusable`.
 * Prefer `resolveWhatsAppConfig()` where the distinction can be surfaced —
 * "credentials are broken" is a far more useful message than "not configured".
 */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const result = await resolveWhatsAppConfig();
  return result.status === 'ok' ? result.config : null;
}

/**
 * Clears the in-process cache so the next resolve re-reads the database/env.
 *
 * Note: this only clears the cache in the current process. In a multi-instance
 * deployment other warm instances keep serving stale config for up to
 * `CACHE_TTL_MS`. That is tolerable for a planned change, but during an
 * incident — a leaked token being revoked — those instances keep sending with
 * the compromised credential for that window, and nothing signals it.
 */
export function invalidateWhatsAppConfigCache(): void {
  cachedResult = null;
  cachedAt = 0;
}

export async function isWhatsAppConfigured(): Promise<boolean> {
  return (await resolveWhatsAppConfig()).status === 'ok';
}
