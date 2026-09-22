import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  chatmaidEventDedupeKey,
  extractChatmaidMessages,
  extractChatmaidOutgoingRecipient,
  verifyChatmaidSignature,
} from '@/lib/whatsapp/providers/chatmaid-inbound';

const secret = 'whsec_test';
const rawBody =
  '{"event":"message.received","data":{"messageId":"inmsg_1","from":"+2348000000000","content":"balance","type":"text"}}';
const timestampSeconds = 1_790_000_000;
const nowMs = timestampSeconds * 1000;

/**
 * Computed once, offline, with OpenSSL -- not with this codebase:
 *
 *   printf '%s' '1790000000.<rawBody>' | openssl dgst -sha256 -hmac 'whsec_test'
 *
 * so a bug shared by the implementation and a test helper cannot make the
 * known-good case pass.
 */
const EXPECTED_V1 = '5ac39082139305d3c679f94079f91d8ec757af268e20086ea9cc7c0578800693';

/** Independent re-implementation of the documented `{t}.{body}` scheme. */
function sign(body: string, t: number | string, key = secret): string {
  const v1 = createHmac('sha256', key).update(`${t}.${body}`, 'utf8').digest('hex');
  return `t=${t},v1=${v1}`;
}

describe('verifyChatmaidSignature', () => {
  it('accepts the known-good signature computed outside the codebase', () => {
    expect(sign(rawBody, timestampSeconds)).toBe(`t=${timestampSeconds},v1=${EXPECTED_V1}`);
    expect(verifyChatmaidSignature(rawBody, `t=${timestampSeconds},v1=${EXPECTED_V1}`, secret, nowMs)).toBe(true);
  });

  it('accepts an uppercase hex digest and a millisecond timestamp', () => {
    const ms = String(nowMs);
    const v1 = createHmac('sha256', secret).update(`${ms}.${rawBody}`, 'utf8').digest('hex').toUpperCase();
    expect(verifyChatmaidSignature(rawBody, `t=${ms},v1=${v1}`, secret, nowMs)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyChatmaidSignature(rawBody, sign(rawBody, timestampSeconds, 'other-secret'), secret, nowMs)).toBe(
      false
    );
  });

  it('rejects a tampered body', () => {
    const header = sign(rawBody, timestampSeconds);
    expect(verifyChatmaidSignature(rawBody.replace('balance', 'Balance'), header, secret, nowMs)).toBe(false);
  });

  it('rejects a tampered timestamp (the timestamp is part of the signed payload)', () => {
    const header = sign(rawBody, timestampSeconds).replace(`t=${timestampSeconds}`, `t=${timestampSeconds + 1}`);
    expect(verifyChatmaidSignature(rawBody, header, secret, nowMs)).toBe(false);
  });

  it('rejects a signature over the body without the "." separator', () => {
    const v1 = createHmac('sha256', secret).update(`${timestampSeconds}${rawBody}`, 'utf8').digest('hex');
    expect(verifyChatmaidSignature(rawBody, `t=${timestampSeconds},v1=${v1}`, secret, nowMs)).toBe(false);
  });

  it('rejects a stale timestamp (older than 5 minutes)', () => {
    const t = timestampSeconds - 5 * 60 - 1;
    expect(verifyChatmaidSignature(rawBody, sign(rawBody, t), secret, nowMs)).toBe(false);
  });

  it('accepts a timestamp exactly at the 5-minute edge', () => {
    const t = timestampSeconds - 5 * 60;
    expect(verifyChatmaidSignature(rawBody, sign(rawBody, t), secret, nowMs)).toBe(true);
  });

  it('rejects a future timestamp (more than 5 minutes ahead)', () => {
    const t = timestampSeconds + 5 * 60 + 1;
    expect(verifyChatmaidSignature(rawBody, sign(rawBody, t), secret, nowMs)).toBe(false);
  });

  it.each([
    ['missing header', null],
    ['empty header', ''],
    ['no v1', `t=${timestampSeconds}`],
    ['no t', `v1=${EXPECTED_V1}`],
    ['non-numeric t', `t=abc,v1=${EXPECTED_V1}`],
    ['Meta-style header', `sha256=${EXPECTED_V1}`],
    ['garbage', 'not a signature'],
    ['non-hex v1 of the right length', `t=${timestampSeconds},v1=${'z'.repeat(64)}`],
    ['v1 one char short', `t=${timestampSeconds},v1=${EXPECTED_V1.slice(0, -1)}`],
    ['v1 one char long', `t=${timestampSeconds},v1=${EXPECTED_V1}0`],
  ])('rejects a malformed header: %s', (_label, header) => {
    expect(verifyChatmaidSignature(rawBody, header, secret, nowMs)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyChatmaidSignature(rawBody, sign(rawBody, timestampSeconds, ''), '', nowMs)).toBe(false);
  });
});

describe('extractChatmaidMessages', () => {
  it('maps the documented message.received payload to the canonical shape', () => {
    expect(
      extractChatmaidMessages({
        event: 'message.received',
        timestamp: '2026-02-06T14:21:09.000Z',
        data: {
          messageId: 'inmsg_abc123def456',
          from: '+2348000000000',
          to: '+15551234567',
          content: 'Thanks, got it!',
          type: 'text',
        },
      })
    ).toEqual([
      {
        id: 'inmsg_abc123def456',
        from: '+2348000000000',
        timestamp: String(Date.parse('2026-02-06T14:21:09.000Z') / 1000),
        type: 'text',
        text: 'Thanks, got it!',
      },
    ]);
  });

  it('normalises from to the +<digits> shape the Twilio extractor produces', () => {
    const [bare] = extractChatmaidMessages({ data: { messageId: 'a', from: '2348000000000', content: 'hi' } });
    const [jid] = extractChatmaidMessages({
      data: { messageId: 'b', from: '2348000000000@s.whatsapp.net', content: 'hi' },
    });
    expect(bare.from).toBe('+2348000000000');
    expect(jid.from).toBe('+2348000000000');
  });

  it('skips malformed items and keeps valid ones in a batched payload', () => {
    const messages = extractChatmaidMessages({
      data: [
        { messageId: 'ok', from: '+2348000000000', content: 'hi', type: 'text' },
        { from: '+2348000000000', content: 'no id' },
        { messageId: 'no-from', content: 'x' },
        { messageId: 'bad-from', from: 12345, content: 'x' },
        null,
        'string item',
      ],
    });
    expect(messages.map((m) => m.id)).toEqual(['ok']);
  });

  it('returns nothing for non-object payloads', () => {
    expect(extractChatmaidMessages(null)).toEqual([]);
    expect(extractChatmaidMessages('x')).toEqual([]);
    expect(extractChatmaidMessages({})).toEqual([]);
  });

  it('gives non-text messages a null text so they are ignored, not answered', () => {
    const [message] = extractChatmaidMessages({
      data: { messageId: 'img', from: '+2348000000000', content: 'caption', type: 'image' },
    });
    expect(message.text).toBeNull();
  });
});

describe('extractChatmaidOutgoingRecipient', () => {
  it('returns the normalised recipient of a manual send', () => {
    expect(
      extractChatmaidOutgoingRecipient({ data: { from: '+15551234567', to: '2348000000000', source: 'manual' } })
    ).toBe('+2348000000000');
  });

  it('returns null when there is no recipient', () => {
    expect(extractChatmaidOutgoingRecipient({ data: { from: '+15551234567' } })).toBeNull();
    expect(extractChatmaidOutgoingRecipient(null)).toBeNull();
  });
});

describe('chatmaidEventDedupeKey', () => {
  it('is stable for the same body and differs for a different body or event', () => {
    const key = chatmaidEventDedupeKey('phone.disconnected', rawBody);
    expect(chatmaidEventDedupeKey('phone.disconnected', rawBody)).toBe(key);
    expect(chatmaidEventDedupeKey('phone.disconnected', `${rawBody} `)).not.toBe(key);
    expect(chatmaidEventDedupeKey('phone.connected', rawBody)).not.toBe(key);
    expect(key.startsWith('chatmaid-event:phone.disconnected:')).toBe(true);
  });
});
