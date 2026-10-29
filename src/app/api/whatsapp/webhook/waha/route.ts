import { NextRequest, NextResponse } from 'next/server';
import { notifyAdmins } from '@/lib/notifications/admin-notifier';
import { recordInboundBatch, recordWebhookDelivery } from '@/lib/system-log/webhook';
import { createSupabaseProcessedMessageStore, resolveWhatsAppConfig } from '@/lib/whatsapp';
import { createSupabaseChatmaidSessionPauseStore } from '@/lib/whatsapp/providers/chatmaid-inbound';
import { processChatmaidMessages } from '@/lib/whatsapp/providers/chatmaid-message-handler';
import type { WahaWhatsAppConfig } from '@/lib/whatsapp/config';
import { lookupWahaLidPhone } from '@/lib/whatsapp/providers/waha';
import {
  WAHA_HUMAN_TAKEOVER_PAUSE_MS,
  extractWahaInbound,
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
  stripPhoneNumbers,
  updateOutboundSendStatus,
  type OutboundDeliveryStatus,
} from '@/lib/whatsapp/outbound-sends';
import { retryFailedStatementSend } from '@/lib/whatsapp/statement-delivery';
import { handleGroupParticipantsEvent } from '@/lib/whatsapp/group-sync';

/**
 * WAHA inbound webhook (#1262).
 *
 * Public and unauthenticated: the signature check is the only guard, and it
 * runs before the body is parsed. Mirrors `webhook/chatmaid/route.ts`; the
 * WAHA event names and payload fields are read from the WAHA documentation
 * (27 Oct 2026) and are not yet measured against a live container.
 *
 * Processing is synchronous. A 500 makes WAHA retry, and the
 * `whatsapp_processed_messages` claim/release dedupe makes those retries safe.
 */

/** Largest body accepted, checked before the signature is computed. */
const WAHA_MAX_BODY_BYTES = 256 * 1024;

/** An unmatched ack is only worth a retry while it could still be the send-record race (#941). */
const STATUS_EVENT_RETRY_WINDOW_MS = 2 * 60 * 1000;

/**
 * A loggable description of an event name, for the 400 paths. Only the event
 * value is logged (never the body, which carries phone numbers and message
 * text), truncated so a hostile sender cannot flood the logs.
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
 * Runs `effect` at most once per distinct event key. A failed effect releases
 * the claim so WAHA's retry gets another attempt.
 */
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

async function handleMessageReceived(payload: unknown, config: WahaWhatsAppConfig) {
  const inbound = await extractWahaInbound(payload, (lid) => lookupWahaLidPhone(config, lid));

  const { result, pausedCount } = await processChatmaidMessages(inbound ? [inbound.message] : []);

  await recordInboundBatch(
    'whatsapp-waha',
    { ...result, ignoredCount: result.ignoredCount + pausedCount },
    { paused: pausedCount }
  );

  if (!result.accepted) {
    return processingFailed(result.error || 'Inbound WhatsApp message could not be processed');
  }

  const ignoredReason = inbound?.ignoredReason ?? (pausedCount > 0 ? 'human_takeover' : null);
  // One row per ignored message (#1282), not again for a retry or the message/message.any twin. Reason only: no number, no text.
  if (ignoredReason && result.duplicateCount === 0) {
    await recordWebhookDelivery({
      provider: 'whatsapp-waha',
      action: 'inbound_ignored',
      outcome: 'success',
      summary: { reason: ignoredReason, count: 1 },
    });
  }

  return NextResponse.json({
    received: true,
    processed: true,
    processed_count: result.processedCount,
    duplicate_count: result.duplicateCount,
    ignored_count: result.ignoredCount + pausedCount,
    paused_count: pausedCount,
    ...(ignoredReason ? { ignored_reason: ignoredReason } : {}),
  });
}

/** A message the admin typed on the handset silences the Assistant for that resident. */
async function handleManualOutgoing(payload: unknown) {
  const recipient = extractWahaOutgoingRecipient(payload);
  if (!recipient) {
    console.warn('[waha-webhook] Manual outgoing message without a usable recipient; ignored');
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
      provider: 'whatsapp-waha',
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

// Every status the WAHA docs list as needing a human: the session is stopped, unpaired or waiting for a passkey.
const SESSION_DOWN_STATUSES = new Set([
  'FAILED',
  'STOPPED',
  'SCAN_QR_CODE',
  'PASSKEY_REQUIRED',
  'PASSKEY_CONFIRMATION_REQUIRED',
]);

async function handleSessionStatus(payload: unknown, dedupeKey: string) {
  const status = (payload as { payload?: { status?: unknown } } | null)?.payload?.status;
  const connected = status === 'WORKING';
  if (!connected && !(typeof status === 'string' && SESSION_DOWN_STATUSES.has(status))) {
    // STARTING and anything unknown are not a state to alert on.
    return NextResponse.json({ received: true, processed: false, ignored: 'session.status' });
  }

  const action = connected ? 'phone_connected' : 'phone_disconnected';
  try {
    const outcome = await runOnce(dedupeKey, () =>
      connected
        ? notifyOrThrow({
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
        : notifyOrThrow({
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
    );

    if (outcome !== 'duplicate') {
      await recordWebhookDelivery({ provider: 'whatsapp-waha', action, outcome: 'success' });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    console.error('[waha-webhook] Failed to handle session.status:', error);
    await recordWebhookDelivery({
      provider: 'whatsapp-waha',
      action,
      outcome: 'failure',
      error: 'session.status could not be processed',
    });
    return processingFailed('session.status could not be processed');
  }
}

class SendNotRecordedYet extends Error {}

/** WAHA ack codes: -1 ERROR, 0 PENDING, 1 SERVER, 2 DEVICE, 3 READ, 4 PLAYED. Only these move a stored send. */
function ackToStatus(ack: unknown): OutboundDeliveryStatus | null {
  if (ack === 1) return 'sent';
  if (ack === 2 || ack === 3) return 'delivered';
  if (ack === -1) return 'failed';
  return null;
}

/**
 * Whether an event is recent enough for the send-record race, judged by
 * `X-Webhook-Timestamp` (milliseconds). A missing or unparseable header counts
 * as recent, so the worst case is a few extra retries, never a lost status.
 */
function isRecentEvent(timestampHeader: string | null): boolean {
  const at = Number(timestampHeader);
  return !timestampHeader || !Number.isFinite(at) || Date.now() - at <= STATUS_EVENT_RETRY_WINDOW_MS;
}

/**
 * Delivery status for a send Residio made (#839), from `message.ack`. `sent`
 * and `delivered` only move the stored send forward, so the log is not
 * flooded; `failed` also writes a log row and, on repeated failures, alerts
 * admins. Deduplicated per delivery (request id) because WAHA retries.
 */
async function handleAck(payload: unknown, dedupeKey: string, timestampHeader: string | null) {
  const data = (payload as { payload?: Record<string, unknown> } | null)?.payload;
  const messageId = typeof data?.id === 'string' && data.id.length > 0 ? data.id : null;
  if (!messageId) {
    console.warn('[waha-webhook] Ack without a message id; ignored');
    return NextResponse.json({ received: true, processed: false, ignored: 'no_message_id' });
  }

  const status = ackToStatus(data?.ack);
  if (!status) {
    return NextResponse.json({ received: true, processed: false, ignored: `ack_${String(data?.ack)}` });
  }

  // WAHA's error ack carries no error text, only a name. Only a failure stores one.
  const errorCode = status === 'failed' && typeof data?.ackName === 'string' ? stripPhoneNumbers(data.ackName).slice(0, 500) : null;
  const errorMessage = status === 'failed' ? 'WAHA reported a delivery error' : null;
  // A WAHA message id embeds the recipient's number (`true_2348...@c.us_3EB0...`), so logs get it with the number stripped.
  const loggableId = stripPhoneNumbers(messageId);

  try {
    let matched = false;
    const outcome = await runOnce(dedupeKey, async () => {
      matched = await updateOutboundSendStatus('waha', messageId, status, { code: errorCode, message: errorMessage });
      // The ack can beat the send record by under a second (#941). Throwing releases the
      // claim and answers 500, so WAHA's retry applies it once the record exists.
      // The window is short (2 minutes) so ids Residio never sent (handset sends) only get a few 500s; after it, or for an id already stored, the event is dropped with a 200; a dropped `failed` still gets its outbound_failed log row below.
      if (!matched && isRecentEvent(timestampHeader) && !(await outboundSendExists('waha', messageId))) {
        throw new SendNotRecordedYet();
      }
      // A statement PDF reply that failed is sent once more with a fresh signed URL (#804).
      // Its failure must not fail this status event, which is already recorded.
      if (status === 'failed' && matched) {
        await retryFailedStatementSend('waha', messageId).catch((error) => {
          console.error('[waha-webhook] Statement retry failed:', { messageId: loggableId, error });
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
      // Ids and error fields only: the payload also carries phone numbers.
      console.warn('[waha-webhook] Outbound message failed:', { messageId: loggableId, errorCode });
      await recordWebhookDelivery({
        provider: 'whatsapp-waha',
        action: 'outbound_failed',
        outcome: 'failure',
        summary: { messageId: loggableId, errorCode, matchedSend: matched },
        error: errorMessage ?? 'Outbound message failed',
      });
    }

    return NextResponse.json({ received: true, processed: true, duplicate: outcome === 'duplicate' });
  } catch (error) {
    if (error instanceof SendNotRecordedYet) {
      // Expected race, not a fault: no failure log row.
      console.warn('[waha-webhook] Ack arrived before its send was stored; asking for a retry', { messageId: loggableId });
      return processingFailed('Send not stored yet; retry');
    }
    console.error('[waha-webhook] Failed to handle message.ack:', error);
    await recordWebhookDelivery({
      provider: 'whatsapp-waha',
      action: 'outbound_status',
      outcome: 'failure',
      summary: { event: 'message.ack', messageId: loggableId },
      error: 'message.ack could not be processed',
    });
    return processingFailed('message.ack could not be processed');
  }
}

/**
 * `group.v2.participants` (#1325): keeps the estate group's member list current.
 * Deduped by the envelope id; a failure releases the claim so WAHA's retry runs again.
 */
async function handleGroupParticipants(payload: unknown, config: WahaWhatsAppConfig, dedupeKey: string) {
  try {
    const box: { outcome?: Awaited<ReturnType<typeof handleGroupParticipantsEvent>> } = {};
    const claim = await runOnce(dedupeKey, async () => {
      box.outcome = await handleGroupParticipantsEvent(payload, config);
    });
    if (claim === 'duplicate' || !box.outcome) {
      return NextResponse.json({ received: true, processed: true, duplicate: true });
    }
    const { handled, ignored, joined, left } = box.outcome;
    return NextResponse.json({ received: true, processed: handled, ...(ignored ? { ignored } : {}), joined, left });
  } catch (error) {
    // The error names a database failure or an HTTP status, never a member number.
    console.error('[waha-webhook] Failed to handle group.v2.participants:', error);
    return processingFailed('group.v2.participants could not be processed');
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

  if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
    return NextResponse.json({ error: 'Webhook is not configured' }, { status: 503 });
  }

  // Size cap, checked before the signature is computed. This endpoint is
  // public, so an unauthenticated sender must not be able to make it HMAC and
  // parse an arbitrarily large payload. The bound is only partial: a declared
  // `content-length` over the cap is refused without reading the body, but
  // without that header `request.text()` still buffers the whole body before
  // the byte check below rejects it.
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
    // Signed but unparseable: a retry would carry the same bytes, so do not
    // ask for one.
    return NextResponse.json({ received: true, processed: false, error: 'Invalid JSON' }, { status: 400 });
  }

  // Dispatch on the event named INSIDE the signed body.
  const event = (payload as { event?: unknown } | null)?.event;
  if (typeof event !== 'string' || event.length === 0) {
    console.warn('[waha-webhook] Rejected: signed body names no event', { event: describeEventValue(event) });
    return NextResponse.json({ received: true, processed: false, error: 'Missing event' }, { status: 400 });
  }

  const inner = (payload as { payload?: { fromMe?: unknown } | null }).payload;

  switch (event) {
    case 'message':
      return handleMessageReceived(payload, resolved.config);
    case 'message.any':
      // `message.any` also carries the handset's own sends; only its inbound ones are answered.
      if (inner?.fromMe === false) {
        return handleMessageReceived(payload, resolved.config);
      }
      if (isWahaManualOutgoing(payload)) {
        return handleManualOutgoing(payload);
      }
      return NextResponse.json({ received: true, processed: false, ignored: 'not_manual' });
    case 'message.ack':
      return handleAck(payload, wahaEventDedupeKey(event, payload, rawBody), request.headers.get('x-webhook-timestamp'));
    case 'group.v2.participants':
      return handleGroupParticipants(payload, resolved.config, wahaEventDedupeKey(event, payload, rawBody));
    case 'session.status':
      return handleSessionStatus(payload, wahaEventDedupeKey(event, payload, rawBody));
    default:
      return NextResponse.json({ received: true, processed: false, ignored: event });
  }
}
