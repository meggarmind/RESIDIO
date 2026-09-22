import { NextRequest, NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import {
  canPerformWhatsAppFinancialLookup,
  createSupabaseProcessedMessageStore,
  createSupabaseWhatsAppFinancialRepository,
  createSupabaseWhatsAppIdentityRepository,
  handleFinancialMessage,
  handleResidentMessage,
  processInboundMessages,
  resolveWhatsAppConfig,
} from '@/lib/whatsapp';
import {
  CHATMAID_HUMAN_TAKEOVER_PAUSE_MS,
  chatmaidEventDedupeKey,
  createSupabaseChatmaidSessionPauseStore,
  extractChatmaidMessages,
  extractChatmaidOutgoingRecipient,
  verifyChatmaidSignature,
} from '@/lib/whatsapp/providers/chatmaid-inbound';

/**
 * Chatmaid inbound webhook (#401).
 *
 * Public and unauthenticated: the signature check is the only guard, and it
 * runs before the body is parsed.
 *
 * Processing is synchronous, like the Twilio route. A 500 makes Chatmaid
 * retry (3 attempts: 1, 5, 15 minutes), and the `whatsapp_processed_messages`
 * claim/release dedupe makes those retries safe. Acknowledging first and
 * processing afterwards would throw that retry away.
 */

/** Largest body accepted, checked before the signature is computed. */
const CHATMAID_MAX_BODY_BYTES = 256 * 1024;

function processingFailed(error: string) {
  return NextResponse.json({ received: true, processed: false, error }, { status: 500 });
}

/**
 * Runs `effect` at most once per distinct event body. A failed effect
 * releases the claim so Chatmaid's retry gets another attempt.
 */
async function runOnce(
  key: string,
  effect: () => Promise<void>
): Promise<'done' | 'duplicate'> {
  const store = createSupabaseProcessedMessageStore();
  const claim = await store.claim(key, new Date().toISOString());
  if (claim === 'duplicate') {
    return 'duplicate';
  }

  try {
    await effect();
  } catch (error) {
    await store.release?.(key);
    throw error;
  }

  return 'done';
}

async function handleMessageReceived(payload: unknown) {
  const pauseStore = createSupabaseChatmaidSessionPauseStore();
  let pausedCount = 0;

  const result = await processInboundMessages(extractChatmaidMessages(payload), {
    store: createSupabaseProcessedMessageStore(),
    onMessage: async (message) => {
      // Human takeover: an admin typed on the handset recently, so the
      // Assistant stays quiet. The message is still claimed, so a retry does
      // not answer it once the pause lapses.
      const pausedUntil = await pauseStore.getPausedUntil(message.from);
      if (pausedUntil && Date.now() < pausedUntil.getTime()) {
        pausedCount += 1;
        return;
      }

      await handleResidentMessage(message, {
        repository: createSupabaseWhatsAppIdentityRepository(),
        onIdentified: async (identifiedMessage, identity) => {
          if (!identity.financialEligible) {
            return;
          }
          await handleFinancialMessage(identifiedMessage, identity, {
            repository: createSupabaseWhatsAppFinancialRepository(),
            optedIn: true,
            canLookup: canPerformWhatsAppFinancialLookup,
          });
        },
      });
    },
  });

  if (!result.accepted) {
    return processingFailed(result.error || 'Inbound WhatsApp message could not be processed');
  }

  return NextResponse.json({
    received: true,
    processed: true,
    processed_count: result.processedCount,
    duplicate_count: result.duplicateCount,
    ignored_count: result.ignoredCount + pausedCount,
    paused_count: pausedCount,
  });
}

async function handleMessageOutgoing(payload: unknown) {
  const recipient = extractChatmaidOutgoingRecipient(payload);
  if (!recipient) {
    console.warn('[chatmaid-webhook] message.outgoing without a usable recipient; ignored');
    return NextResponse.json({ received: true, processed: false, ignored: 'no_recipient' });
  }

  try {
    await createSupabaseChatmaidSessionPauseStore().pause(
      recipient,
      new Date(Date.now() + CHATMAID_HUMAN_TAKEOVER_PAUSE_MS)
    );
  } catch (error) {
    console.error('[chatmaid-webhook] Failed to pause the Assistant for a human takeover:', error);
    return processingFailed('Human-takeover pause could not be recorded');
  }

  return NextResponse.json({ received: true, processed: true });
}

async function notifyOrThrow(params: Parameters<typeof notifyAdmins>[0]) {
  const result = await notifyAdmins(params);
  if (!result.success) {
    throw new Error(result.error || 'Admin notification failed');
  }
}

async function handlePhoneHealth(event: 'phone.disconnected' | 'phone.connected', rawBody: string) {
  try {
    const outcome = await runOnce(chatmaidEventDedupeKey(event, rawBody), () =>
      event === 'phone.disconnected'
        ? notifyOrThrow({
            title: 'WhatsApp is DISCONNECTED: resident messages are being lost',
            body:
              'The Chatmaid WhatsApp bridge has disconnected. Messages residents send while it is down are ' +
              'permanently lost: they are never delivered to Residio, and nothing is recovered when it reconnects. ' +
              'Re-pair the handset in the Chatmaid dashboard now, and tell residents to use the fallback channel ' +
              '(SMS or the estate office) until WhatsApp is restored.',
            category: 'system',
            priority: 'urgent',
            actionUrl: '/settings/whatsapp',
            metadata: { source: 'chatmaid_webhook', event },
          })
        : notifyOrThrow({
            title: 'WhatsApp reconnected',
            body:
              'The Chatmaid WhatsApp bridge is connected again and the Assistant is receiving messages. ' +
              'Messages sent while it was down were not received; residents who wrote in during the outage ' +
              'may need to be contacted.',
            category: 'system',
            priority: 'normal',
            actionUrl: '/settings/whatsapp',
            metadata: { source: 'chatmaid_webhook', event },
          })
    );

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    console.error(`[chatmaid-webhook] Failed to handle ${event}:`, error);
    return processingFailed(`${event} could not be processed`);
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveWhatsAppConfig();

  if (resolved.status === 'unusable') {
    // Distinct from "not configured": credentials are stored but unreadable,
    // so every signature check would fail against the wrong secret.
    return NextResponse.json(
      { error: `Webhook credentials are unusable: ${resolved.reason}` },
      { status: 503 }
    );
  }

  if (resolved.status !== 'ok' || resolved.config.provider !== 'chatmaid') {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  // Cap the body before reading and hashing it: this endpoint is public, and
  // an unauthenticated sender must not be able to make it buffer and HMAC an
  // arbitrarily large payload.
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > CHATMAID_MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > CHATMAID_MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const signature = request.headers.get('x-chatmaid-signature');

  if (!verifyChatmaidSignature(rawBody, signature, resolved.config.webhookSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but unparseable: a retry would carry the same bytes, so do not
    // ask for one.
    return NextResponse.json({ received: true, processed: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Dispatch on the event named INSIDE the signed body, never on the
  // `X-Chatmaid-Event` header: the signature does not cover headers, so
  // trusting it would let anyone replay a genuine signed body under a
  // different event (a signed `phone.connected` resent as
  // `phone.disconnected` would raise a false urgent alert). The header is
  // only a consistency check.
  const bodyEvent = (payload as { event?: unknown } | null)?.event;
  if (typeof bodyEvent !== 'string' || bodyEvent.length === 0) {
    return NextResponse.json({ received: true, processed: false, error: 'Missing event' }, { status: 400 });
  }

  const headerEvent = request.headers.get('x-chatmaid-event');
  if (headerEvent !== null && headerEvent !== bodyEvent) {
    return NextResponse.json(
      { received: true, processed: false, error: 'Event header does not match the signed body' },
      { status: 400 }
    );
  }

  const event = bodyEvent;

  switch (event) {
    case 'message.received':
      return handleMessageReceived(payload);
    case 'message.outgoing':
      return handleMessageOutgoing(payload);
    case 'phone.disconnected':
    case 'phone.connected':
      return handlePhoneHealth(event, rawBody);
    case 'message.sent':
    case 'message.delivered':
    case 'message.read':
    case 'message.failed':
      // No provider updates delivery status on notification_history today
      // (Meta and Twilio do not either), so there is nothing to mirror.
      // `delivered` is terminal success; `read` is never waited on.
      if (event === 'message.failed') {
        // Ids and error fields only: the payload also carries phone numbers.
        const data = (payload as { data?: Record<string, unknown> } | null)?.data;
        console.warn('[chatmaid-webhook] Outbound message failed:', {
          messageId: data?.messageId,
          errorCode: data?.errorCode,
          errorMessage: data?.errorMessage,
        });
      }
      return NextResponse.json({ received: true, processed: false, ignored: event });
    default:
      return NextResponse.json({ received: true, processed: false, ignored: event });
  }
}
