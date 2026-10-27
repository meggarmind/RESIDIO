import { NextRequest, NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { recordInboundBatch, recordWebhookDelivery } from '@/lib/system-log/webhook';
import { createSupabaseProcessedMessageStore, resolveWhatsAppConfig } from '@/lib/whatsapp';
import { createSupabaseChatmaidSessionPauseStore } from '@/lib/whatsapp/providers/chatmaid-inbound';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';
import {
  WAHA_HUMAN_TAKEOVER_PAUSE_MS,
  extractWahaMessages,
  extractWahaOutgoingRecipient,
  isWahaManualOutgoing,
  verifyWahaSignature,
  wahaEventDedupeKey,
} from '@/lib/whatsapp/providers/waha-inbound';
import {
  OUTBOUND_FAILURE_ALERT_THRESHOLD,
  OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES,
  countRecentOutboundFailures,
  outboundSendExists,
  updateOutboundSendStatus,
  type OutboundDeliveryStatus,
} from '@/lib/whatsapp/outbound-sends';
import { retryFailedStatementSend } from '@/lib/whatsapp/statement-delivery';

/**
 * WAHA inbound webhook (#1262), mirroring the Chatmaid route (#401).
 *
 * Public and unauthenticated: the HMAC-SHA512 signature is the only guard,
 * and it runs before the body is parsed. Processing is synchronous: a 500
 * makes WAHA retry, and the `whatsapp_processed_messages` claim/release
 * dedupe makes those retries safe.
 */

const WAHA_MAX_BODY_BYTES = 256 * 1024;
const LOG_PROVIDER = 'whatsapp-waha';
const OUTBOUND_PROVIDER = 'waha';

function processingFailed(error: string) {
  return NextResponse.json({ received: true, processed: false, error }, { status: 500 });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Runs `effect` at most once per key. A failed effect releases the claim so WAHA's retry gets another attempt. */
async function runOnce(key: string, effect: () => Promise<void>): Promise<'done' | 'duplicate'> {
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

async function notifyOrThrow(params: Parameters<typeof notifyAdmins>[0]) {
  const result = await notifyAdmins(params);
  if (!result.success) {
    throw new Error(result.error || 'Admin notification failed');
  }
}

async function handleMessage(payload: unknown) {
  const { result, pausedCount } = await processChatmaidMessages(extractWahaMessages(payload));

  await recordInboundBatch(
    LOG_PROVIDER,
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

async function handleManualOutgoing(payload: unknown) {
  const recipient = extractWahaOutgoingRecipient(payload);
  if (!recipient) {
    console.warn('[waha-webhook] Handset message without a usable recipient; ignored');
    return NextResponse.json({ received: true, processed: false, ignored: 'no_recipient' });
  }

  try {
    await createSupabaseChatmaidSessionPauseStore().pause(
      recipient,
      new Date(Date.now() + WAHA_HUMAN_TAKEOVER_PAUSE_MS)
    );
  } catch (error) {
    console.error('[waha-webhook] Failed to pause the Assistant for a human takeover:', error);
    await recordWebhookDelivery({
      provider: LOG_PROVIDER,
      action: 'human_takeover',
      outcome: 'failure',
      error: 'Human-takeover pause could not be recorded',
    });
    return processingFailed('Human-takeover pause could not be recorded');
  }

  // A successful pause is not recorded: it fires on every handset message an admin types.
  return NextResponse.json({ received: true, processed: true });
}

const DISCONNECTED_STATUSES = new Set(['FAILED', 'STOPPED', 'SCAN_QR_CODE']);

/** Session health (`session.status`): WORKING is reconnected; FAILED, STOPPED and SCAN_QR_CODE are disconnected. */
async function handleSessionStatus(payload: unknown, dedupeKey: string) {
  const status = asRecord(asRecord(payload)?.payload)?.status;
  const disconnected = typeof status === 'string' && DISCONNECTED_STATUSES.has(status);
  if (status !== 'WORKING' && !disconnected) {
    return NextResponse.json({ received: true, processed: false, ignored: `session.status:${String(status)}` });
  }
  const action = disconnected ? 'phone_disconnected' : 'phone_connected';

  try {
    const outcome = await runOnce(dedupeKey, () =>
      disconnected
        ? notifyOrThrow({
            title: 'WhatsApp is DISCONNECTED: resident messages are being lost',
            body:
              'The WAHA WhatsApp bridge has disconnected. Messages residents send while it is down are ' +
              'permanently lost: they are never delivered to Residio, and nothing is recovered when it reconnects. ' +
              'Re-pair the handset in the WAHA dashboard now, and tell residents to use the fallback channel ' +
              '(SMS or the estate office) until WhatsApp is restored.',
            category: 'system',
            priority: 'urgent',
            actionUrl: '/settings/whatsapp',
            metadata: { source: 'waha_webhook', event: 'session.status', status },
          })
        : notifyOrThrow({
            title: 'WhatsApp reconnected',
            body:
              'The WAHA WhatsApp bridge is connected again and the Assistant is receiving messages. ' +
              'Messages sent while it was down were not received; residents who wrote in during the outage ' +
              'may need to be contacted.',
            category: 'system',
            priority: 'normal',
            actionUrl: '/settings/whatsapp',
            metadata: { source: 'waha_webhook', event: 'session.status', status },
          })
    );

    if (outcome !== 'duplicate') {
      await recordWebhookDelivery({ provider: LOG_PROVIDER, action, outcome: 'success' });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    console.error('[waha-webhook] Failed to handle session.status:', error);
    await recordWebhookDelivery({
      provider: LOG_PROVIDER,
      action,
      outcome: 'failure',
      error: 'session.status could not be processed',
    });
    return processingFailed('session.status could not be processed');
  }
}

class SendNotRecordedYet extends Error {}

/** An unmatched ack is only worth a retry while it could still be the send-record race (#941). */
const STATUS_EVENT_RETRY_WINDOW_MS = 2 * 60 * 1000;

/** WAHA's event time (unix ms on the webhook body), or receipt time when it is missing. */
function isRecentEvent(payload: unknown): boolean {
  const at = Number(asRecord(payload)?.timestamp);
  if (!Number.isFinite(at) || at <= 0) return true;
  return Date.now() - (at < 1e12 ? at * 1000 : at) <= STATUS_EVENT_RETRY_WINDOW_MS;
}

/** WAHA ack levels: ERROR -1, PENDING 0, SERVER 1, DEVICE 2, READ 3 (PLAYED 4 is a voice note read). */
function ackToStatus(ack: unknown): OutboundDeliveryStatus | null {
  if (ack === -1) return 'failed';
  if (ack === 1) return 'sent';
  if (ack === 2 || ack === 3 || ack === 4) return 'delivered';
  return null;
}

/**
 * Delivery status for a send Residio made (#839), from `message.ack`.
 * Mirrors the Chatmaid route's `handleDeliveryStatus`, including the #941
 * guard for an ack that beats the send record.
 */
async function handleAck(payload: unknown, dedupeKey: string) {
  const message = asRecord(asRecord(payload)?.payload);
  const messageId = typeof message?.id === 'string' && message.id.length > 0 ? message.id : null;
  const status = ackToStatus(message?.ack);
  // An ack on a message a resident sent (our read receipt) is not a send Residio made.
  if (message?.fromMe === false) {
    return NextResponse.json({ received: true, processed: false, ignored: 'inbound_ack' });
  }
  if (!messageId || !status) {
    return NextResponse.json({ received: true, processed: false, ignored: messageId ? 'ack_pending' : 'no_message_id' });
  }

  try {
    let matched = false;
    const outcome = await runOnce(dedupeKey, async () => {
      matched = await updateOutboundSendStatus(OUTBOUND_PROVIDER, messageId, status, { code: 'ERROR', message: null });
      // The ack can beat the send record (#941): throwing releases the claim and answers 500, so
      // WAHA's retry applies it once the record exists. After the short window the ack is dropped.
      if (!matched && isRecentEvent(payload) && !(await outboundSendExists(OUTBOUND_PROVIDER, messageId))) {
        throw new SendNotRecordedYet();
      }
      // A statement PDF reply that failed is sent once more with a fresh signed URL (#804).
      if (status === 'failed' && matched) {
        await retryFailedStatementSend(OUTBOUND_PROVIDER, messageId).catch((error) => {
          console.error('[waha-webhook] Statement retry failed:', { messageId, error });
        });
      }
      // Equality, not >=, so a burst raises one alert rather than one per further failure.
      if (status === 'failed' && matched && (await countRecentOutboundFailures()) === OUTBOUND_FAILURE_ALERT_THRESHOLD) {
        await notifyOrThrow({
          title: 'WhatsApp replies are failing to deliver',
          body:
            `${OUTBOUND_FAILURE_ALERT_THRESHOLD} WhatsApp messages failed to deliver in the last ` +
            `${OUTBOUND_FAILURE_ALERT_WINDOW_MINUTES} minutes. Residents are not receiving the Assistant's replies. ` +
            'Check the failed sends in the WhatsApp operations console and the handset in the WAHA dashboard.',
          category: 'system',
          priority: 'high',
          actionUrl: '/settings/whatsapp',
          metadata: { source: 'waha_webhook', event: 'message.ack' },
        });
      }
    });

    if (status === 'failed' && outcome !== 'duplicate') {
      console.warn('[waha-webhook] Outbound message failed:', { messageId });
      await recordWebhookDelivery({
        provider: LOG_PROVIDER,
        action: 'outbound_failed',
        outcome: 'failure',
        summary: { messageId, matchedSend: matched },
        error: 'Outbound message failed',
      });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    if (error instanceof SendNotRecordedYet) {
      console.warn('[waha-webhook] Ack arrived before its send was stored; asking for a retry', { messageId });
      return processingFailed('Send not stored yet; retry');
    }
    console.error('[waha-webhook] Failed to handle message.ack:', error);
    await recordWebhookDelivery({
      provider: LOG_PROVIDER,
      action: 'outbound_status',
      outcome: 'failure',
      summary: { event: 'message.ack', messageId },
      error: 'message.ack could not be processed',
    });
    return processingFailed('message.ack could not be processed');
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolveWhatsAppConfig();

  if (resolved.status === 'unusable') {
    return NextResponse.json(
      { error: `Webhook credentials are unusable: ${resolved.reason}` },
      { status: 503 }
    );
  }

  if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  // Size cap before the signature is computed (see the Chatmaid route for the limits of this bound).
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > WAHA_MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > WAHA_MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  if (
    !verifyWahaSignature(
      rawBody,
      request.headers.get('x-webhook-hmac'),
      request.headers.get('x-webhook-hmac-algorithm'),
      resolved.config.webhookSecret
    )
  ) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Signed but unparseable: a retry would carry the same bytes, so do not ask for one.
    return NextResponse.json({ received: true, processed: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Dispatch on the event inside the signed body; headers are not signed.
  const event = asRecord(payload)?.event;
  if (typeof event !== 'string' || event.length === 0) {
    return NextResponse.json({ received: true, processed: false, error: 'Missing event' }, { status: 400 });
  }
  const dedupeKey = wahaEventDedupeKey(event, request.headers.get('x-webhook-request-id'), rawBody);
  const message = asRecord(asRecord(payload)?.payload);

  switch (event) {
    case 'message':
      return handleMessage(payload);
    case 'message.any':
      if (message?.fromMe !== true) return handleMessage(payload);
      if (isWahaManualOutgoing(payload)) return handleManualOutgoing(payload);
      // The bot's own API send echoed back: nothing to do.
      return NextResponse.json({ received: true, processed: false, ignored: 'not_manual' });
    case 'message.ack':
      return handleAck(payload, dedupeKey);
    case 'session.status':
      return handleSessionStatus(payload, dedupeKey);
    default:
      return NextResponse.json({ received: true, processed: false, ignored: event });
  }
}
