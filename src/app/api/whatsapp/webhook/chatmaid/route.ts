import { NextRequest, NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { recordInboundBatch, recordWebhookDelivery } from '@/lib/system-log/webhook';
import { createSupabaseProcessedMessageStore, resolveWhatsAppConfig } from '@/lib/whatsapp';
import {
  CHATMAID_HUMAN_TAKEOVER_PAUSE_MS,
  chatmaidEventDedupeKey,
  createSupabaseChatmaidSessionPauseStore,
  extractChatmaidMessages,
  extractChatmaidOutgoingRecipient,
  isChatmaidManualOutgoing,
  verifyChatmaidSignature,
} from '@/lib/whatsapp/providers/chatmaid-inbound';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';
import {
  OUTBOUND_FAILURE_ALERT_THRESHOLD,
  OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES,
  countRecentOutboundFailures,
  outboundSendExists,
  stripPhoneNumbers,
  updateOutboundSendStatus,
  type OutboundDeliveryStatus,
} from '@/lib/whatsapp/outbound-sends';
import { retryFailedStatementSend } from '@/lib/whatsapp/statement-delivery';

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

/**
 * A loggable description of an event name, for the 400 paths. Only the event
 * value is logged (never the body, which carries phone numbers and message
 * text), truncated so a hostile header cannot flood the logs.
 */
function describeEventValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value !== 'string') {
    return `<${typeof value}>`;
  }
  return value.length > 64 ? `${JSON.stringify(value.slice(0, 64))}...` : JSON.stringify(value);
}

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
  const { result, pausedCount } = await processChatmaidMessages(extractChatmaidMessages(payload));

  await recordInboundBatch(
    'whatsapp-chatmaid',
    { ...result, ignoredCount: result.ignoredCount + pausedCount },
    { paused: pausedCount }
  );

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
  if (!isChatmaidManualOutgoing(payload)) {
    return NextResponse.json({ received: true, processed: false, ignored: 'not_manual' });
  }

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
    await recordWebhookDelivery({
      provider: 'whatsapp-chatmaid',
      action: 'human_takeover',
      outcome: 'failure',
      error: 'Human-takeover pause could not be recorded',
    });
    return processingFailed('Human-takeover pause could not be recorded');
  }

  // A successful pause is deliberately not recorded: it fires on every handset message an admin types, so it would flood the log. Failures above are.
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

    if (outcome !== 'duplicate') {
      await recordWebhookDelivery({
        provider: 'whatsapp-chatmaid',
        action: event === 'phone.disconnected' ? 'phone_disconnected' : 'phone_connected',
        outcome: 'success',
      });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    console.error('[chatmaid-webhook] Failed to handle %s:', event, error);
    await recordWebhookDelivery({
      provider: 'whatsapp-chatmaid',
      action: event === 'phone.disconnected' ? 'phone_disconnected' : 'phone_connected',
      outcome: 'failure',
      error: `${event} could not be processed`,
    });
    return processingFailed(`${event} could not be processed`);
  }
}

class SendNotRecordedYet extends Error {}

/** An unmatched status event is only worth a retry while it could still be the send-record race (#941). */
const STATUS_EVENT_RETRY_WINDOW_MS = 2 * 60 * 1000;

/** The provider's event time, or receipt time (now) when it is missing or unparseable. */
function isRecentEvent(payload: unknown): boolean {
  const at = Date.parse(String((payload as { timestamp?: unknown } | null)?.timestamp ?? ''));
  return Number.isNaN(at) || Date.now() - at <= STATUS_EVENT_RETRY_WINDOW_MS;
}

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return stripPhoneNumbers(String(value)).slice(0, 500);
}

/**
 * Delivery status for a send Residio made (#839). `sent` and `delivered` only
 * move the stored send forward, so the log is not flooded; `failed` also
 * writes a log row and, on repeated failures, alerts admins. Deduplicated per
 * event body because Chatmaid retries webhooks.
 */
async function handleDeliveryStatus(event: 'message.sent' | 'message.delivered' | 'message.failed', payload: unknown, rawBody: string) {
  const data = (payload as { data?: Record<string, unknown> } | null)?.data;
  const messageId = typeof data?.messageId === 'string' && data.messageId.length > 0 ? data.messageId : null;
  if (!messageId) {
    console.warn('[chatmaid-webhook] Status event without a messageId; ignored', { event });
    return NextResponse.json({ received: true, processed: false, ignored: 'no_message_id' });
  }

  const status = event.slice('message.'.length) as OutboundDeliveryStatus;
  // Error text from the provider can quote the recipient, so numbers are stripped.
  const errorCode = optionalText(data?.errorCode);
  const errorMessage = optionalText(data?.errorMessage);

  try {
    let matched = false;
    const outcome = await runOnce(chatmaidEventDedupeKey(event, rawBody), async () => {
      matched = await updateOutboundSendStatus('chatmaid', messageId, status, { code: errorCode, message: errorMessage });
      // The event can beat the send record by under a second (#941). Throwing releases the
      // claim and answers 500, so Chatmaid's retry applies it once the record exists.
      // The retry window is short (2 minutes) so ids Residio never sent (handset sends) only get a few 500s; after it, or for an id already stored, the event is dropped with a 200 so Chatmaid does not see an endless run of
      // errors; a dropped `failed` still gets its outbound_failed log row below.
      if (!matched && isRecentEvent(payload) && !(await outboundSendExists('chatmaid', messageId))) {
        throw new SendNotRecordedYet();
      }
      // A statement PDF reply that failed is sent once more with a fresh signed URL (#804).
      // Its failure must not fail this status event, which is already recorded.
      if (status === 'failed' && matched) {
        await retryFailedStatementSend('chatmaid', messageId).catch((error) => {
          console.error('[chatmaid-webhook] Statement retry failed:', { messageId, error });
        });
      }
      // Equality, not >=, so a burst raises one alert rather than one per further failure.
      if (status === 'failed' && matched && (await countRecentOutboundFailures()) === OUTBOUND_FAILURE_ALERT_THRESHOLD) {
        await notifyOrThrow({
          title: 'WhatsApp replies are failing to deliver',
          body:
            `${OUTBOUND_FAILURE_ALERT_THRESHOLD} WhatsApp messages failed to deliver in the last ` +
            `${OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES} minutes. Residents are not receiving the Assistant's replies. ` +
            'Check the failed sends in the WhatsApp operations console and the handset in the Chatmaid dashboard.',
          category: 'system',
          priority: 'high',
          actionUrl: '/settings/whatsapp',
          metadata: { source: 'chatmaid_webhook', event },
        });
      }
    });

    if (status === 'failed' && outcome !== 'duplicate') {
      // Ids and error fields only: the payload also carries phone numbers.
      console.warn('[chatmaid-webhook] Outbound message failed:', { messageId, errorCode, errorMessage });
      await recordWebhookDelivery({
        provider: 'whatsapp-chatmaid',
        action: 'outbound_failed',
        outcome: 'failure',
        summary: { messageId, errorCode, errorMessage, matchedSend: matched },
        error: errorMessage ?? errorCode ?? 'Outbound message failed',
      });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    if (error instanceof SendNotRecordedYet) {
      // Expected race, not a fault: no failure log row.
      console.warn('[chatmaid-webhook] Status event arrived before its send was stored; asking for a retry', { event, messageId });
      return processingFailed('Send not stored yet; retry');
    }
    console.error('[chatmaid-webhook] Failed to handle %s:', event, error);
    await recordWebhookDelivery({
      provider: 'whatsapp-chatmaid',
      action: 'outbound_status',
      outcome: 'failure',
      summary: { event, messageId },
      error: `${event} could not be processed`,
    });
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

  // Size cap, checked before the signature is computed. This endpoint is
  // public, so an unauthenticated sender must not be able to make it HMAC and
  // parse an arbitrarily large payload. The bound is only partial: a declared
  // `content-length` over the cap is refused without reading the body, but
  // without that header `request.text()` still buffers the whole body (up to
  // the platform's own request-body limit) before the byte check below
  // rejects it. No streaming read is attempted.
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
  const headerEvent = request.headers.get('x-chatmaid-event');

  if (typeof bodyEvent !== 'string' || bodyEvent.length === 0) {
    console.warn('[chatmaid-webhook] Rejected: signed body names no event', {
      headerEvent: describeEventValue(headerEvent),
      bodyEvent: describeEventValue(bodyEvent),
    });
    return NextResponse.json({ received: true, processed: false, error: 'Missing event' }, { status: 400 });
  }

  if (headerEvent !== null && headerEvent !== bodyEvent) {
    console.warn('[chatmaid-webhook] Rejected: X-Chatmaid-Event header does not match the signed body', {
      headerEvent: describeEventValue(headerEvent),
      bodyEvent: describeEventValue(bodyEvent),
    });
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
    case 'message.failed':
      return handleDeliveryStatus(event, payload, rawBody);
    case 'message.read':
      // `delivered` is terminal success; `read` is never waited on.
      return NextResponse.json({ received: true, processed: false, ignored: event });
    default:
      return NextResponse.json({ received: true, processed: false, ignored: event });
  }
}
