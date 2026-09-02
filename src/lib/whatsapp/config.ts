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

const CACHE_TTL_MS = 30_000;

let cachedConfig: WhatsAppConfig | null = null;
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
 * 1. A 30s in-process cache, to avoid hitting the database on every
 *    webhook/send call.
 * 2. The `whatsapp_provider_credentials` table (encrypted, admin
 *    managed) — an active row there wins outright and is returned
 *    as-is; fields are never merged across sources.
 * 3. Environment variables, as a fallback for estates that haven't
 *    migrated to database-backed credentials yet.
 */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const now = Date.now();
  if (cachedConfig !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  const dbConfig = await loadWhatsAppConfigFromDb();
  const config = dbConfig ?? getWhatsAppConfigFromEnv();

  cachedConfig = config;
  cachedAt = now;

  return config;
}

/**
 * Clears the in-process WhatsApp config cache so the next call to
 * `getWhatsAppConfig()` re-reads the database/env.
 *
 * Note: this only clears the cache in the current process. In a
 * multi-instance deployment, other warm instances may keep serving
 * stale config for up to `CACHE_TTL_MS` after credentials change.
 */
export function invalidateWhatsAppConfigCache(): void {
  cachedConfig = null;
  cachedAt = 0;
}

export async function isWhatsAppConfigured(): Promise<boolean> {
  return (await getWhatsAppConfig()) !== null;
}
