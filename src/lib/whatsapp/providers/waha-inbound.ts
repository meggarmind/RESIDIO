import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  CHATMAID_HUMAN_TAKEOVER_PAUSE_MS,
  normalizeChatmaidPhone,
} from '@/lib/whatsapp/providers/chatmaid-inbound';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

/**
 * WAHA inbound webhook support (#1262): signature verification and payload
 * extraction. The human-takeover pause store is the Chatmaid one
 * (`createSupabaseChatmaidSessionPauseStore`): it is keyed by phone number and
 * has nothing provider-specific in it.
 *
 * Every shape below is read from the WAHA documentation (https://waha.devlike.pro,
 * read 27 Oct 2026) and is NOT yet measured against a live WAHA container.
 * Webhook body: `{ event, session, engine, metadata, payload }`.
 */

/** How long a message typed on the handset silences the Assistant. One value for both bridges. */
export const WAHA_HUMAN_TAKEOVER_PAUSE_MS = CHATMAID_HUMAN_TAKEOVER_PAUSE_MS;

const SHA512_HEX_LENGTH = 128;

/**
 * Verifies WAHA's webhook signature.
 *
 * Headers: `X-Webhook-Hmac` (hex HMAC-SHA512 over the raw body, keyed with the
 * webhook secret) and `X-Webhook-Hmac-Algorithm` (must be `sha512`). The
 * signature covers the body only, not the headers and not
 * `X-Webhook-Timestamp`, so there is no replay window here: a replayed body is
 * stopped by the processed-message dedupe, not by this check.
 *
 * Rejects: no secret, a missing header, any algorithm other than `sha512`, a
 * signature that is not a 128-char hex digest, and a digest mismatch.
 */
export function verifyWahaSignature(
  rawBody: string,
  hmacHeader: string | null,
  algorithmHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader || !algorithmHeader || !secret) {
    return false;
  }
  if (algorithmHeader.trim().toLowerCase() !== 'sha512') {
    return false;
  }

  const provided = hmacHeader.trim().toLowerCase();
  if (provided.length !== SHA512_HEX_LENGTH || !/^[0-9a-f]+$/.test(provided)) {
    return false;
  }

  const expected = createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** The `payload` object of a webhook body. */
function payloadOf(body: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(body)?.payload);
}

/** WAHA timestamps are unix seconds; downstream code reads `Number(timestamp) * 1000`, so a seconds string is kept. */
function toUnixSecondsString(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return String(Math.floor(value >= 1e12 ? value / 1000 : value));
  }
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Maps one WAHA message object (a webhook `payload`, or an item from the chats
 * store read) to the canonical inbound shape. Shared by the webhook and the
 * reconciliation cron, so both apply the same rules.
 *
 * `id`, `from`, `body`, `hasMedia` and `timestamp` are the fields used. Returns
 * null only for an object without a usable `id`: with no id there is nothing to
 * dedupe on.
 *
 * Messages the Assistant must never answer are still returned, with
 * `text: null`, so `processInboundMessages` claims them and counts them as
 * ignored (it does that for a null-text `text` or `group` message):
 * - `fromMe`: the handset's own message (the bot's reply, or an admin typing);
 * - `@g.us` groups: answering would disclose one resident's finances to the group;
 * - `status@broadcast`: status updates;
 * - `@lid`: a hidden id that carries no phone number. It is a known Baileys
 *   multi-device trap: a resident who is a linked-device contact can arrive as
 *   an `@lid` with no way to tell the number here (resolution is out of scope, #1262).
 */
export function wahaMessageToInbound(message: Record<string, unknown>): WhatsAppInboundMessage | null {
  const id = typeof message.id === 'string' && message.id.length > 0 ? message.id : null;
  if (!id) {
    return null;
  }

  const from = typeof message.from === 'string' ? message.from : '';
  const timestamp = toUnixSecondsString(message.timestamp);
  // `from` stays raw for an ignored message: it is never read, and an `@lid` must not pass for a phone number.
  const ignored = (type: 'text' | 'group'): WhatsAppInboundMessage => ({ id, from, timestamp, type, text: null });

  if (from.endsWith('@g.us') || from === 'status@broadcast') {
    return ignored('group');
  }
  if (message.fromMe === true || from.endsWith('@lid') || !from.endsWith('@c.us')) {
    return ignored('text');
  }

  const phone = normalizeChatmaidPhone(from);
  if (!phone) {
    return ignored('text');
  }

  const hasMedia = message.hasMedia === true;
  const body = typeof message.body === 'string' && message.body.length > 0 ? message.body : null;
  return {
    id,
    from: phone,
    timestamp,
    type: hasMedia ? 'media' : 'text',
    // 1:1 media gets the text-only reply (#804), so its caption is not read as a command.
    text: hasMedia ? null : body,
  };
}

/**
 * Parses a `message` or `message.any` webhook body into at most one canonical
 * message. Takes the whole body (`{ event, payload }`).
 */
export function extractWahaMessages(body: unknown): WhatsAppInboundMessage[] {
  const payload = payloadOf(body);
  const message = payload ? wahaMessageToInbound(payload) : null;
  return message ? [message] : [];
}

/**
 * Whether a `message.any` event is a human typing on the connected handset:
 * `fromMe` with `source: 'app'`. `source: 'api'` is Residio's own send and must
 * not pause the Assistant (#797).
 */
export function isWahaManualOutgoing(body: unknown): boolean {
  const payload = payloadOf(body);
  return payload?.fromMe === true && payload.source === 'app';
}

/** The resident an admin just typed to on the handset: the `to` of a manual outgoing message. */
export function extractWahaOutgoingRecipient(body: unknown): string | null {
  return normalizeChatmaidPhone(payloadOf(body)?.to);
}

/**
 * Dedupe key for events that carry no message id (session status). It is the
 * event name plus the `X-Webhook-Request-Id` header, which WAHA repeats on a
 * retry of the same delivery. A request without that header falls back to a
 * SHA-256 of the raw body, so a retry still dedupes. The `waha-event:` prefix
 * keeps it clear of real message ids in `whatsapp_processed_messages`.
 *
 * `event` must be the event named in the signed body. The request id header is
 * not covered by the signature.
 */
export function wahaEventDedupeKey(event: string, requestId: string | null, rawBody: string): string {
  const id = requestId?.trim() || `body-${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`;
  return `waha-event:${event}:${id}`;
}
