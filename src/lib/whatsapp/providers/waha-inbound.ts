import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CHATMAID_HUMAN_TAKEOVER_PAUSE_MS } from '@/lib/whatsapp/providers/chatmaid-inbound';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

/**
 * WAHA inbound webhook support (#1262): signature verification and payload
 * extraction. Mirrors `providers/chatmaid-inbound.ts`; the human-takeover
 * pause store and the message handler are shared with Chatmaid.
 *
 * WAHA webhook body: `{ id, timestamp, event, session, me, payload, engine }`.
 * Message events carry the message in `payload`
 * (`{ id, timestamp, from, fromMe, source, to, body, hasMedia }`).
 */

/** One pause length for both bridges, not two. */
export const WAHA_HUMAN_TAKEOVER_PAUSE_MS = CHATMAID_HUMAN_TAKEOVER_PAUSE_MS;

const SIGNATURE_HEX_LENGTH = 128; // HMAC-SHA512 digest, hex-encoded

/**
 * Verifies WAHA's webhook signature: `X-Webhook-Hmac` is HMAC-SHA512 of the
 * raw body, keyed with the webhook secret, hex-encoded, and
 * `X-Webhook-Hmac-Algorithm` must be `sha512`.
 *
 * Rejects: no secret, a missing header, any other algorithm, and a value that
 * is not a 128-char hex digest. WAHA does not sign a timestamp, so there is no
 * replay window; replays are absorbed by the processed-message dedupe.
 */
export function verifyWahaSignature(
  rawBody: string,
  hmacHeader: string | null,
  algorithmHeader: string | null,
  secret: string
): boolean {
  if (!hmacHeader || !secret || algorithmHeader?.trim().toLowerCase() !== 'sha512') {
    return false;
  }

  const provided = hmacHeader.trim().toLowerCase();
  if (provided.length !== SIGNATURE_HEX_LENGTH || !/^[0-9a-f]+$/.test(provided)) {
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

/** `+<digits>` from a `<digits>@c.us` chat id, or null for anything shorter than a phone number. */
function phoneFromChatId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.split('@')[0].replace(/[^\d]/g, '');
  return digits.length < 7 ? null : `+${digits}`;
}

/**
 * Unix seconds as a string, the canonical inbound timestamp: the financial
 * flow reads it as `Number(timestamp) * 1000`, so an ISO string would break it.
 */
function toUnixSecondsString(value: unknown): string {
  const raw = typeof value === 'number' ? value : Number(value);
  const ms = Number.isFinite(raw) && raw > 0 ? raw * (raw < 1e12 ? 1000 : 1) : Date.now();
  return String(Math.floor(ms / 1000));
}

/**
 * Maps one WAHA message object (the webhook `payload`, or an item from the
 * chat messages API the reconciliation cron reads) to the canonical shape.
 * Returns null without an id or a usable sender: nothing to dedupe on.
 *
 * Messages the Assistant must not answer come back with `text: null` and type
 * `text` or `group`, which `processInboundMessages` counts as ignored:
 * - `fromMe`: the estate's own message.
 * - `@g.us` and `status@broadcast`: a group or status update. The Assistant
 *   must never answer in a group (it would disclose one resident's finances).
 * - `@lid`: a known Baileys multi-device trap. WhatsApp can address a sender
 *   by an opaque linked-device id instead of a phone number, so the digits are
 *   not a phone and identity lookup would match the wrong resident or none.
 *   Ignored until `@lid` resolution exists (#1260 follow-up).
 */
export function wahaMessageToInbound(message: unknown): WhatsAppInboundMessage | null {
  const data = asRecord(message);
  if (!data) return null;

  const id = typeof data.id === 'string' && data.id.length > 0 ? data.id : null;
  const rawFrom = typeof data.from === 'string' ? data.from : '';
  if (!id || !rawFrom) return null;

  const isGroup = rawFrom.endsWith('@g.us') || rawFrom === 'status@broadcast';
  const skip = isGroup || data.fromMe === true || rawFrom.endsWith('@lid') || !rawFrom.endsWith('@c.us');
  const from = phoneFromChatId(rawFrom) ?? (skip ? `+${rawFrom.replace(/[^\d]/g, '') || '0'}` : null);
  if (!from) return null;

  const timestamp = toUnixSecondsString(data.timestamp);
  if (skip) {
    return { id, from, timestamp, type: isGroup ? 'group' : 'text', text: null };
  }

  const body = typeof data.body === 'string' && data.body.length > 0 ? data.body : null;
  return { id, from, timestamp, type: data.hasMedia === true ? 'media' : 'text', text: body };
}

/** The message in a `message` or `message.any` webhook body, as a batch of at most one. */
export function extractWahaMessages(payload: unknown): WhatsAppInboundMessage[] {
  const message = wahaMessageToInbound(asRecord(payload)?.payload);
  return message ? [message] : [];
}

/**
 * Whether a `message.any` event is a human typing on the paired handset.
 * WAHA marks those `source: 'app'`; the bot's own API sends are
 * `source: 'api'` and must not pause it (#797).
 */
export function isWahaManualOutgoing(payload: unknown): boolean {
  const message = asRecord(asRecord(payload)?.payload);
  return message?.fromMe === true && message.source === 'app';
}

/** The resident an admin just typed to on the handset. */
export function extractWahaOutgoingRecipient(payload: unknown): string | null {
  return phoneFromChatId(asRecord(asRecord(payload)?.payload)?.to);
}

/**
 * Dedupe key for events with no message id (session status, acks). WAHA sends
 * the same `X-Webhook-Request-Id` on every retry of one delivery. Without the
 * header, a hash of the raw body stands in. The `waha-event:` prefix keeps the
 * key clear of real message ids in `whatsapp_processed_messages`.
 */
export function wahaEventDedupeKey(event: string, requestId: string | null, rawBody = ''): string {
  const id = requestId?.trim() || createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return `waha-event:${event}:${id}`;
}
