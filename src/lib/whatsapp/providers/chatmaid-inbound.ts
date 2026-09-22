import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { createAdminClient } from '@/lib/supabase/server';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

/**
 * Chatmaid inbound webhook support (#401): signature verification, payload
 * extraction and the human-takeover pause store.
 *
 * Kept apart from `providers/chatmaid.ts` (the send transport), following the
 * Twilio precedent of doing provider-specific extraction/verification in the
 * provider layer rather than in the Meta-only `inbound.ts`.
 */

/**
 * Replay window for `X-Chatmaid-Signature` timestamps, in either direction.
 *
 * 30 minutes, deliberately wider than the usual 5. Chatmaid retries a failed
 * delivery at 1, 5 and 15 minutes (22 minutes after the first attempt in
 * total), and its docs do not say whether a retry is re-signed with a fresh
 * `t`. If it is not, a 5-minute window would reject the 5- and 15-minute
 * retries and the event would be lost for good. Losing an event is worse than
 * accepting an old one: replayed `message.received` and `phone.*` events are
 * already deduped by the processed-message store, and a replayed
 * `message.outgoing` only re-sets a pause.
 */
export const CHATMAID_SIGNATURE_TOLERANCE_MS = 30 * 60 * 1000;

/** How long a `message.outgoing` (a human typing on the handset) silences the Assistant. */
export const CHATMAID_HUMAN_TAKEOVER_PAUSE_MS = 30 * 60 * 1000;

const SIGNATURE_HEX_LENGTH = 64; // HMAC-SHA256 digest, hex-encoded

/**
 * The exact string Chatmaid HMACs.
 *
 * UNVERIFIED AGAINST A LIVE WEBHOOK. Chatmaid's published docs
 * (https://www.chatmaid.net/llms-full.txt, "Signature Verification", read
 * 2026-09-22) say the signed message is `"{timestamp}.{raw_body}"` -- a
 * `.`-separated concatenation. Issue #401 describes it as `timestamp + rawBody`
 * without naming a separator, and an older Chatmaid blog post shows a
 * different, un-timestamped `sha256=<hex>` scheme over the body alone. The
 * documented `.` form is used here. If live webhooks fail verification, this
 * function is the single place to change.
 */
export function buildChatmaidSignedPayload(timestamp: string, rawBody: string): string {
  return `${timestamp}.${rawBody}`;
}

interface ParsedChatmaidSignature {
  timestamp: string;
  signature: string;
}

/**
 * Parses `t=<timestamp>,v1=<hex>`. Returns null for anything malformed:
 * missing parts, a non-numeric timestamp, or a signature that is not exactly
 * one SHA-256 hex digest.
 */
function parseChatmaidSignatureHeader(header: string): ParsedChatmaidSignature | null {
  let timestamp: string | undefined;
  let signature: string | undefined;

  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      return null;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') {
      timestamp = value;
    } else if (key === 'v1') {
      signature = value;
    }
  }

  if (!timestamp || !/^\d{1,16}$/.test(timestamp)) {
    return null;
  }

  if (!signature || signature.length !== SIGNATURE_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(signature)) {
    return null;
  }

  return { timestamp, signature: signature.toLowerCase() };
}

/**
 * Chatmaid documents `t` in seconds (`t=1700000000`). Values large enough to
 * only make sense as milliseconds are accepted as such, so a unit change on
 * their side fails the replay window rather than silently passing it.
 */
function timestampToMs(timestamp: string): number {
  const value = Number(timestamp);
  return value >= 1e12 ? value : value * 1000;
}

/**
 * Verifies Chatmaid's inbound webhook signature.
 *
 * Header: `X-Chatmaid-Signature: t=<timestamp>,v1=<hex>`. The `v1` value is
 * HMAC-SHA256, keyed with the webhook signing secret, over
 * `buildChatmaidSignedPayload(t, rawBody)`, hex-encoded.
 *
 * This is deliberately NOT `verifyWhatsAppSignature` (Meta signs
 * `sha256=<hex>` over the raw body alone, with no timestamp and so no replay
 * protection).
 *
 * Rejects: no secret, missing or malformed header, a signature that is not a
 * 64-char hex digest, and a timestamp more than
 * `CHATMAID_SIGNATURE_TOLERANCE_MS` away from `nowMs` in either direction.
 */
export function verifyChatmaidSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now()
): boolean {
  if (!header || !secret) {
    return false;
  }

  const parsed = parseChatmaidSignatureHeader(header);
  if (!parsed) {
    return false;
  }

  const timestampMs = timestampToMs(parsed.timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > CHATMAID_SIGNATURE_TOLERANCE_MS) {
    return false;
  }

  const expected = createHmac('sha256', secret)
    .update(buildChatmaidSignedPayload(parsed.timestamp, rawBody), 'utf8')
    .digest('hex');

  const providedBuffer = Buffer.from(parsed.signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

/**
 * Normalises a Chatmaid phone value to the `+<digits>` shape the Twilio
 * extractor yields (`whatsapp:+234...` -> `+234...`), so identity lookup and
 * `whatsapp_sessions` keys match whichever provider a message arrived on.
 * Chatmaid documents E.164 (`+15557654321`); a bare-digit or WhatsApp JID
 * (`2348...@s.whatsapp.net`) value is tolerated defensively.
 */
export function normalizeChatmaidPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  let value = raw.trim();
  if (value.startsWith('whatsapp:')) {
    value = value.slice('whatsapp:'.length);
  }
  const at = value.indexOf('@');
  if (at >= 0) {
    value = value.slice(0, at);
  }

  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7) {
    return null;
  }

  return `+${digits}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toUnixSecondsString(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = typeof value === 'number' ? value * (value < 1e12 ? 1000 : 1) : Date.parse(value);
    if (Number.isFinite(parsed)) {
      return String(Math.floor(parsed / 1000));
    }
  }
  return String(Math.floor(Date.now() / 1000));
}

/**
 * Parses a Chatmaid `message.received` body into the canonical
 * `WhatsAppInboundMessage` shape, so `processInboundMessages` stays
 * provider-neutral.
 *
 * Documented shape (llms-full.txt, read 2026-09-22):
 * `{ event, timestamp, data: { messageId, from, to, content, type } }`.
 *
 * `data` is also accepted as an array, defensively -- the docs show a single
 * object, but nothing forbids batching and a batched payload must not be
 * silently dropped. Items without a `messageId` or a usable `from` are skipped:
 * without an id there is nothing to dedupe on.
 */
export function extractChatmaidMessages(payload: unknown): WhatsAppInboundMessage[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const items = Array.isArray(root.data) ? root.data : [root.data];
  const messages: WhatsAppInboundMessage[] = [];

  for (const item of items) {
    const data = asRecord(item);
    if (!data) {
      continue;
    }

    const id = typeof data.messageId === 'string' && data.messageId.length > 0 ? data.messageId : null;
    const from = normalizeChatmaidPhone(data.from);
    if (!id || !from) {
      continue;
    }

    const type = typeof data.type === 'string' && data.type.length > 0 ? data.type : 'text';
    const content = typeof data.content === 'string' && data.content.length > 0 ? data.content : null;

    messages.push({
      id,
      from,
      timestamp: toUnixSecondsString(data.timestamp ?? root.timestamp),
      type,
      // Only text is answered; media is out of scope for #401.
      text: type === 'text' ? content : null,
    });
  }

  return messages;
}

/**
 * The recipient of a `message.outgoing` event -- the resident an admin just
 * typed to on the connected handset. Documented shape:
 * `{ event, timestamp, data: { from, to, source: 'manual' } }`.
 */
export function extractChatmaidOutgoingRecipient(payload: unknown): string | null {
  const data = asRecord(asRecord(payload)?.data);
  return data ? normalizeChatmaidPhone(data.to) : null;
}

/**
 * Stable dedupe key for events that carry no message id (phone health,
 * outgoing). Chatmaid documents no event or delivery id header, so the key is
 * the event name plus a SHA-256 of the raw body: a retry of the same event
 * resends the same body (it carries the event's own `timestamp`), so it hashes
 * the same. The `chatmaid-event:` prefix keeps it clear of real message ids in
 * the shared `whatsapp_processed_messages` table.
 */
export function chatmaidEventDedupeKey(event: string, rawBody: string): string {
  const digest = createHash('sha256').update(rawBody, 'utf8').digest('hex');
  return `chatmaid-event:${event}:${digest}`;
}

export interface ChatmaidSessionPauseStore {
  /** When the Assistant's pause for this conversation ends, or null if never paused. */
  getPausedUntil(phoneNumber: string): Promise<Date | null>;
  /** Pauses the Assistant for this conversation until `until`. */
  pause(phoneNumber: string, until: Date): Promise<void>;
}

/**
 * `whatsapp_sessions.paused_until`, via the admin client (the table is
 * service-role only).
 *
 * Phone numbers are normalised with the same `normalizePhoneNumber` the
 * financial flow keys sessions on, so the pause lands on the row that flow
 * reads and writes.
 *
 * `pause` updates an existing row; when there is none it inserts one with
 * `expires_at = now()`. `expires_at` is NOT NULL and the financial flow only
 * treats rows with `expires_at > now()` as a live session, so an already-
 * expired row carries the pause without inventing a conversation: the next
 * `saveSession` upserts on `phone_number`, overwriting only its own columns
 * and leaving `paused_until` intact. A unique-violation on insert means a row
 * appeared concurrently, so the update is retried once.
 */
export function createSupabaseChatmaidSessionPauseStore(): ChatmaidSessionPauseStore {
  return {
    async getPausedUntil(phoneNumber) {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('paused_until')
        .eq('phone_number', normalizePhoneNumber(phoneNumber))
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data?.paused_until ? new Date(data.paused_until) : null;
    },

    async pause(phoneNumber, until) {
      const supabase = createAdminClient();
      const normalized = normalizePhoneNumber(phoneNumber);
      const now = new Date().toISOString();

      const update = async () => {
        const { data, error } = await supabase
          .from('whatsapp_sessions')
          .update({ paused_until: until.toISOString(), updated_at: now })
          .eq('phone_number', normalized)
          .select('id');
        if (error) {
          throw error;
        }
        return (data ?? []).length;
      };

      if ((await update()) > 0) {
        return;
      }

      const { error: insertError } = await supabase.from('whatsapp_sessions').insert({
        phone_number: normalized,
        paused_until: until.toISOString(),
        expires_at: now,
      });

      if (!insertError) {
        return;
      }

      if (insertError.code === '23505') {
        await update();
        return;
      }

      throw insertError;
    },
  };
}
