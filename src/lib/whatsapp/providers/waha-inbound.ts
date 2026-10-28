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
 * Why an inbound WAHA message gets no answer (#1282). Recorded as a count by
 * reason, never with the sender or the text.
 */
export type WahaIgnoreReason = 'group' | 'from_me' | 'lid_unresolved' | 'other_id' | 'no_text';

export interface WahaInbound {
  message: WhatsAppInboundMessage;
  /** Null when the message goes to the Assistant. */
  ignoredReason: WahaIgnoreReason | null;
}

function mapWahaMessage(message: Record<string, unknown>): WahaInbound | null {
  const id = typeof message.id === 'string' && message.id.length > 0 ? message.id : null;
  if (!id) {
    return null;
  }

  const from = typeof message.from === 'string' ? message.from : '';
  const timestamp = toUnixSecondsString(message.timestamp);
  // `from` stays raw for an ignored message: it is never read, and an `@lid` must not pass for a phone number.
  const ignored = (type: 'text' | 'group', ignoredReason: WahaIgnoreReason): WahaInbound => ({
    message: { id, from, timestamp, type, text: null },
    ignoredReason,
  });

  if (from.endsWith('@g.us') || from === 'status@broadcast') {
    return ignored('group', 'group');
  }
  if (message.fromMe === true) {
    return ignored('text', 'from_me');
  }
  if (from.endsWith('@lid')) {
    return ignored('text', 'lid_unresolved');
  }
  const phone = from.endsWith('@c.us') ? normalizeChatmaidPhone(from) : null;
  if (!phone) {
    return ignored('text', 'other_id');
  }

  const hasMedia = message.hasMedia === true;
  const body = typeof message.body === 'string' && message.body.length > 0 ? message.body : null;
  return {
    message: {
      id,
      from: phone,
      timestamp,
      type: hasMedia ? 'media' : 'text',
      // 1:1 media gets the text-only reply (#804), so its caption is not read as a command.
      text: hasMedia ? null : body,
    },
    ignoredReason: hasMedia || body ? null : 'no_text',
  };
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
 * - `@lid`: a hidden id that carries no phone number. This function does not
 *   resolve it; the webhook does, with `resolveWahaInbound` (#1282).
 */
export function wahaMessageToInbound(message: Record<string, unknown>): WhatsAppInboundMessage | null {
  return mapWahaMessage(message)?.message ?? null;
}

/** Returns the `2348...@c.us` id WAHA holds for an `@lid`, or null when it knows none. */
export type WahaLidLookup = (lid: string) => Promise<string | null>;

/**
 * `wahaMessageToInbound` plus the reason a message is ignored, with an `@lid`
 * sender resolved to its phone number through `lookupLid` (#1282). The NOWEB
 * engine can deliver a resident's id as `@lid`.
 *
 * A wrong mapping would answer the wrong resident, so only a `@c.us` answer is
 * used. Anything else leaves the message ignored as `lid_unresolved`. A lookup
 * error propagates, so the webhook can answer 500 and WAHA retries.
 */
export async function resolveWahaInbound(
  message: Record<string, unknown>,
  lookupLid: WahaLidLookup
): Promise<WahaInbound | null> {
  const mapped = mapWahaMessage(message);
  if (mapped?.ignoredReason !== 'lid_unresolved') {
    return mapped;
  }

  const phoneId = await lookupLid(message.from as string);
  return phoneId?.endsWith('@c.us') ? mapWahaMessage({ ...message, from: phoneId }) : mapped;
}

/**
 * Parses a `message` or `message.any` webhook body into at most one inbound
 * message. Takes the whole body (`{ event, payload }`).
 */
export async function extractWahaInbound(body: unknown, lookupLid: WahaLidLookup): Promise<WahaInbound | null> {
  const payload = payloadOf(body);
  return payload ? resolveWahaInbound(payload, lookupLid) : null;
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
 * Dedupe key for events that carry no message id (`message.ack`, `session.status`).
 * It is the event name plus the `id` of WAHA's event envelope (an `evt_` ULID,
 * https://waha.devlike.pro/docs/how-to/events/), which WAHA repeats on a retry of
 * the same delivery. An envelope without a string `id` falls back to a SHA-256 of
 * the raw body, so a retry still dedupes. The `waha-event:` prefix keeps it clear
 * of real message ids in `whatsapp_processed_messages`.
 *
 * `body` is the parsed body and `event` the event named in it. Both come from the
 * signed body, so the HMAC covers them. The request-id and timestamp HEADERS are
 * deliberately not used: the signature does not cover headers, so a captured body
 * replayed under a fresh header would otherwise get a fresh key and raise its
 * notice again.
 */
export function wahaEventDedupeKey(event: string, body: unknown, rawBody: string): string {
  const envelopeId = asRecord(body)?.id;
  const id =
    typeof envelopeId === 'string' && envelopeId.trim()
      ? envelopeId.trim()
      : `body-${createHash('sha256').update(rawBody, 'utf8').digest('hex')}`;
  return `waha-event:${event}:${id}`;
}
