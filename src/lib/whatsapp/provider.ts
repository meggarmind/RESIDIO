import { resolveWhatsAppConfig, type MetaWhatsAppConfig, type WhatsAppConfig } from '@/lib/whatsapp/config';
import { createMetaWhatsAppProvider } from '@/lib/whatsapp/providers/meta';
import type {
  WhatsAppSendResult,
  WhatsAppTemplateMessage,
  WhatsAppTextMessage,
} from '@/lib/whatsapp/types';

export interface WhatsAppProvider {
  sendText(message: WhatsAppTextMessage): Promise<WhatsAppSendResult>;
  sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>;
}

// Re-exported for backward compatibility: callers (and the foundation test)
// import this from '@/lib/whatsapp' / '@/lib/whatsapp/provider', not from
// './providers/meta' directly. Keeping the export here means moving the
// implementation out did not move the public seam.
export { createMetaWhatsAppProvider };

type ProviderFactory = (config: WhatsAppConfig) => WhatsAppProvider;

/**
 * One factory per supported `WhatsAppConfig['provider']` value. Adding a new
 * provider (e.g. Twilio) is meant to be additive: a new file under
 * `./providers/`, plus one entry here -- nothing below this map, in
 * `config.ts`, or in any caller should need to change.
 */
const PROVIDER_REGISTRY: Partial<Record<WhatsAppConfig['provider'], ProviderFactory>> = {
  meta: (config) => createMetaWhatsAppProvider(config as MetaWhatsAppConfig),
};

/**
 * Whether an adapter exists for this provider yet.
 *
 * The entry points below gate on this rather than on a hardcoded `'meta'`,
 * so registering a new adapter above lifts the gate automatically. Hardcoding
 * the check would mean adding a provider required editing the entry points
 * too, which is exactly the additivity this registry exists to provide.
 */
function isProviderSupported(config: WhatsAppConfig): boolean {
  return PROVIDER_REGISTRY[config.provider] !== undefined;
}

function resolveProvider(config: WhatsAppConfig): WhatsAppProvider {
  const factory = PROVIDER_REGISTRY[config.provider];
  if (!factory) {
    // Unreachable while callers gate on isProviderSupported() first; kept so a
    // future direct caller fails loudly rather than dereferencing undefined.
    throw new Error(`No WhatsApp provider registered for "${config.provider}"`);
  }
  return factory(config);
}

export async function sendWhatsAppMessage(
  message: WhatsAppTextMessage,
  provider?: WhatsAppProvider
): Promise<WhatsAppSendResult> {
  const resolved = provider ? null : await resolveWhatsAppConfig();

  if (resolved && resolved.status === 'unusable') {
    // Stored credentials exist but cannot be used. Do not fall through to a
    // generic "not configured" -- that sends an admin looking for a missing
    // setting when the real cause is an unreadable one.
    return { success: false, error: `WhatsApp credentials are unusable: ${resolved.reason}` };
  }

  if (resolved && resolved.status !== 'ok') {
    return { success: false, error: 'WhatsApp service is not configured' };
  }

  if (resolved && !isProviderSupported(resolved.config)) {
    return { success: false, error: 'WhatsApp provider is not supported yet' };
  }

  const config = resolved ? resolved.config : null;

  try {
    return await (provider || resolveProvider(config!)).sendText(message);
  } catch {
    return {
      success: false,
      error: 'WhatsApp provider request failed',
    };
  }
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage,
  provider?: WhatsAppProvider
): Promise<WhatsAppSendResult> {
  const resolved = provider ? null : await resolveWhatsAppConfig();

  if (resolved && resolved.status === 'unusable') {
    // Stored credentials exist but cannot be used. Do not fall through to a
    // generic "not configured" -- that sends an admin looking for a missing
    // setting when the real cause is an unreadable one.
    return { success: false, error: `WhatsApp credentials are unusable: ${resolved.reason}` };
  }

  if (resolved && resolved.status !== 'ok') {
    return { success: false, error: 'WhatsApp service is not configured' };
  }

  if (resolved && !isProviderSupported(resolved.config)) {
    return { success: false, error: 'WhatsApp provider is not supported yet' };
  }

  const config = resolved ? resolved.config : null;

  try {
    return await (provider || resolveProvider(config!)).sendTemplate(message);
  } catch {
    return { success: false, error: 'WhatsApp provider request failed' };
  }
}
