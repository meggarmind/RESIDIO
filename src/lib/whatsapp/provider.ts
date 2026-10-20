import { resolveWhatsAppConfig, type ChatmaidWhatsAppConfig, type MetaWhatsAppConfig, type TwilioWhatsAppConfig, type WhatsAppConfig } from '@/lib/whatsapp/config';
import { createMetaWhatsAppProvider } from '@/lib/whatsapp/providers/meta';
import { createTwilioWhatsAppProvider } from '@/lib/whatsapp/providers/twilio';
import { createChatmaidWhatsAppProvider } from '@/lib/whatsapp/providers/chatmaid';
import { decideSend } from '@/lib/comms-override/gate';
import { prefixText } from '@/lib/comms-override/labels';
import { blockedError, toLogRecord } from '@/lib/comms-override/resolver';
import type { CommsSendContext, OverrideLogRecord } from '@/lib/comms-override/types';
import { recordOutboundSend, type OutboundSendTracking } from '@/lib/whatsapp/outbound-sends';
import { normalizePhoneNumber } from '@/lib/sms/termii';
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
 * One factory per supported `WhatsAppConfig['provider']` value.
 *
 * Scope, stated precisely because an earlier version of this comment
 * overclaimed: this registry governs the SEND path only. Registering an
 * adapter here enables outbound automatically, because the entry points below
 * gate on `isProviderSupported()` rather than on a hardcoded provider name.
 *
 * It does NOT govern inbound. Each provider has its own inbound route --
 * `src/app/api/whatsapp/webhook/route.ts` for Meta,
 * `src/app/api/whatsapp/webhook/twilio/route.ts` for Twilio, and
 * `src/app/api/whatsapp/webhook/chatmaid/route.ts` for Chatmaid -- and must,
 * because webhook signature verification and payload parsing are
 * provider-specific in a way sending is not: Meta uses HMAC-SHA256 over the
 * raw body, Twilio HMAC-SHA1 over the URL plus sorted params, and Chatmaid a
 * third scheme again (`"{timestamp}.{raw_body}"`, see `buildChatmaidSignedPayload`
 * in `providers/chatmaid-inbound.ts`; `signature.ts` is Meta's verifier). Registering
 * a provider here makes it able to send; a separate route registration is
 * what makes it able to receive.
 */
const PROVIDER_REGISTRY: Partial<Record<WhatsAppConfig['provider'], ProviderFactory>> = {
  meta: (config) => createMetaWhatsAppProvider(config as MetaWhatsAppConfig),
  twilio: (config) => createTwilioWhatsAppProvider(config as TwilioWhatsAppConfig),
  chatmaid: (config) => createChatmaidWhatsAppProvider(config as ChatmaidWhatsAppConfig),
};

/**
 * Whether an adapter exists for this provider yet.
 *
 * The entry points below gate on this rather than on a hardcoded `'meta'`,
 * so registering a new adapter above lifts the gate automatically. Hardcoding
 * the check would mean adding a provider required editing the entry points
 * too, which is exactly the additivity this registry exists to provide.
 */
export function isProviderSupported(config: WhatsAppConfig): boolean {
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

type WhatsAppRedirect =
  | { blocked: WhatsAppSendResult }
  | { to: string; redirected: boolean; envLabel: string; override?: OverrideLogRecord };

/**
 * Communications override (#715) for WhatsApp. Runs inside the provider seam,
 * AFTER `evaluateSendPolicy` has judged the ORIGINAL recipient (decision 11), and
 * only changes the destination. A block never falls through to the original.
 */
async function resolveWhatsAppRedirect(
  original: string,
  context: CommsSendContext | undefined
): Promise<WhatsAppRedirect> {
  const { result, envLabel } = await decideSend({
    channel: 'whatsapp',
    original,
    residentOverride: context?.residentOverride,
    purpose: context?.purpose,
  });
  const override = toLogRecord(result) ?? undefined;
  if ('blocked' in result) {
    return {
      blocked: {
        success: false,
        error: blockedError(result),
        // Only an unreadable settings table is transient; a blank override needs an admin.
        retryable: result.code === 'settings_unreadable',
        override,
      },
    };
  }
  if (!result.redirect) return { to: original, redirected: false, envLabel };
  return { to: normalizePhoneNumber(result.to), redirected: true, envLabel, override };
}

/** Stores an accepted send for delivery tracking (#839); a stubbed provider (tests) has no config. */
async function trackAcceptedSend(
  result: WhatsAppSendResult,
  config: WhatsAppConfig | null,
  to: string,
  context: CommsSendContext | undefined,
  tracking: OutboundSendTracking | undefined
): Promise<void> {
  const purpose = context?.purpose ?? tracking?.purpose;
  if (!result.success || !result.messageId || !config || !tracking || !purpose) return;
  await recordOutboundSend({ ...tracking, purpose, provider: config.provider, providerMessageId: result.messageId, phoneNumber: to });
}

export async function sendWhatsAppMessage(
  message: WhatsAppTextMessage,
  provider?: WhatsAppProvider,
  context?: CommsSendContext,
  tracking?: OutboundSendTracking
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

  const redirect = await resolveWhatsAppRedirect(message.to, context);
  if ('blocked' in redirect) return redirect.blocked;
  // Free-form text can carry the label; the original is also in the log record.
  const outbound = redirect.redirected
    ? { ...message, to: redirect.to, body: prefixText(redirect.envLabel, message.to, message.body) }
    : message;

  try {
    const result = await (provider || resolveProvider(config!)).sendText(outbound);
    await trackAcceptedSend(result, config, message.to, context, tracking);
    return redirect.override ? { ...result, override: redirect.override } : result;
  } catch {
    return {
      success: false,
      error: 'WhatsApp provider request failed',
      ...(redirect.override ? { override: redirect.override } : {}),
    };
  }
}

export async function sendWhatsAppTemplate(
  message: WhatsAppTemplateMessage,
  provider?: WhatsAppProvider,
  context?: CommsSendContext,
  tracking?: OutboundSendTracking
): Promise<WhatsAppSendResult> {
  const resolved = provider ? null : await resolveWhatsAppConfig();

  if (resolved && resolved.status === 'unusable') {
    // Stored credentials exist but cannot be used. Do not fall through to a
    // generic "not configured" -- that sends an admin looking for a missing
    // setting when the real cause is an unreadable one.
    return { success: false, error: `WhatsApp credentials are unusable: ${resolved.reason}`, retryable: false };
  }

  if (resolved && resolved.status !== 'ok') {
    return { success: false, error: 'WhatsApp service is not configured', retryable: false };
  }

  if (resolved && !isProviderSupported(resolved.config)) {
    return { success: false, error: 'WhatsApp provider is not supported yet', retryable: false };
  }

  const config = resolved ? resolved.config : null;

  const redirect = await resolveWhatsAppRedirect(message.to, context);
  if ('blocked' in redirect) return redirect.blocked;
  // KNOWN LIMIT: an approved template cannot be prefixed or bannered, so a
  // redirected template send carries no visible label. The original recipient is
  // recorded in the log only (`metadata.override`).
  const outbound = redirect.redirected ? { ...message, to: redirect.to } : message;

  try {
    const result = await (provider || resolveProvider(config!)).sendTemplate(outbound);
    await trackAcceptedSend(result, config, message.to, context, tracking);
    return redirect.override ? { ...result, override: redirect.override } : result;
  } catch {
    return {
      success: false,
      error: 'WhatsApp provider request failed',
      retryable: true,
      ...(redirect.override ? { override: redirect.override } : {}),
    };
  }
}
