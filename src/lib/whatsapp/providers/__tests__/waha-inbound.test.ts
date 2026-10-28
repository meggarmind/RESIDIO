import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CHATMAID_HUMAN_TAKEOVER_PAUSE_MS } from '@/lib/whatsapp/providers/chatmaid-inbound';
import {
  WAHA_HUMAN_TAKEOVER_PAUSE_MS,
  extractWahaInbound,
  resolveWahaInbound,
  extractWahaOutgoingRecipient,
  isWahaManualOutgoing,
  verifyWahaSignature,
  wahaEventDedupeKey,
  wahaMessageToInbound,
} from '@/lib/whatsapp/providers/waha-inbound';

const secret = 'waha_whsec_test';
const rawBody =
  '{"event":"message","session":"default","payload":{"id":"true_2348000000000@c.us_ABC","from":"2348000000000@c.us","fromMe":false,"body":"balance","hasMedia":false,"timestamp":1790000000}}';

/**
 * Computed once, offline, with OpenSSL -- not with this codebase:
 *
 *   printf '%s' '<rawBody>' | openssl dgst -sha512 -hmac 'waha_whsec_test'
 *
 * so a bug shared by the implementation and a test helper cannot make the
 * known-good case pass.
 */
const EXPECTED_HMAC =
  '77a047e6278c59c554a13bc6c63cc9df1eb4d4ab280e917ab6bf303d4ca889f10877942be82200204a875b9b5bdf2a1362e768267657fc00ecccb8a714d46200';

function sign(body: string, key = secret): string {
  return createHmac('sha512', key).update(body, 'utf8').digest('hex');
}

function body(payload: Record<string, unknown>, event = 'message') {
  return { event, session: 'default', payload };
}

describe('verifyWahaSignature', () => {
  it('accepts the known-good signature computed outside the codebase', () => {
    expect(sign(rawBody)).toBe(EXPECTED_HMAC);
    expect(verifyWahaSignature(rawBody, EXPECTED_HMAC, 'sha512', secret)).toBe(true);
  });

  it('accepts an uppercase digest and an uppercase algorithm name', () => {
    expect(verifyWahaSignature(rawBody, EXPECTED_HMAC.toUpperCase(), 'SHA512', secret)).toBe(true);
  });

  it('rejects a signature made with the wrong secret', () => {
    expect(verifyWahaSignature(rawBody, sign(rawBody, 'other-secret'), 'sha512', secret)).toBe(false);
  });

  it('rejects a tampered body', () => {
    expect(verifyWahaSignature(rawBody.replace('balance', 'Balance'), EXPECTED_HMAC, 'sha512', secret)).toBe(false);
  });

  it.each(['sha256', 'sha1', 'md5', ''])('rejects the algorithm header "%s"', (algorithm) => {
    expect(verifyWahaSignature(rawBody, EXPECTED_HMAC, algorithm, secret)).toBe(false);
  });

  it('rejects a missing algorithm header, a missing signature and an empty secret', () => {
    expect(verifyWahaSignature(rawBody, EXPECTED_HMAC, null, secret)).toBe(false);
    expect(verifyWahaSignature(rawBody, null, 'sha512', secret)).toBe(false);
    expect(verifyWahaSignature(rawBody, EXPECTED_HMAC, 'sha512', '')).toBe(false);
  });

  it('rejects a SHA-256 digest even with the sha512 header, and a non-hex value', () => {
    const sha256 = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
    expect(verifyWahaSignature(rawBody, sha256, 'sha512', secret)).toBe(false);
    expect(verifyWahaSignature(rawBody, 'z'.repeat(128), 'sha512', secret)).toBe(false);
  });
});


const noLookup = vi.fn(async () => null);

/** The webhook's extraction, without the reason, for the mapping tests. */
async function extractWahaMessages(webhookBody: unknown) {
  const inbound = await extractWahaInbound(webhookBody, noLookup);
  return inbound ? [inbound.message] : [];
}

describe('wahaMessageToInbound / extractWahaInbound', () => {
  it('extracts a 1:1 text message: id, +digits sender, unix-seconds timestamp, text', async () => {
    const messages = await extractWahaMessages(
      body({ id: 'true_2348000000000@c.us_ABC', from: '2348000000000@c.us', fromMe: false, body: 'balance', hasMedia: false, timestamp: 1790000000 })
    );

    expect(messages).toEqual([
      { id: 'true_2348000000000@c.us_ABC', from: '+2348000000000', timestamp: '1790000000', type: 'text', text: 'balance' },
    ]);
  });

  it('types a 1:1 media message as media with no text, so it gets the text-only reply (#804)', async () => {
    const [message] = await extractWahaMessages(
      body({ id: 'm1', from: '2348000000000@c.us', fromMe: false, body: 'caption', hasMedia: true, timestamp: 1790000000 })
    );

    expect(message).toMatchObject({ id: 'm1', from: '+2348000000000', type: 'media', text: null });
  });

  it('returns text null for a message with an empty body', async () => {
    const [message] = await extractWahaMessages(body({ id: 'm1', from: '2348000000000@c.us', fromMe: false, body: '', hasMedia: false, timestamp: 1 }));

    expect(message).toMatchObject({ type: 'text', text: null });
  });

  it('returns a fromMe message with text null, so it is counted as ignored', async () => {
    const [message] = await extractWahaMessages(
      body({ id: 'm1', from: '2348000000000@c.us', fromMe: true, body: 'my own reply', hasMedia: false, timestamp: 1 }, 'message.any')
    );

    expect(message).toMatchObject({ id: 'm1', text: null });
    expect(JSON.stringify(message)).not.toContain('my own reply');
  });

  it('returns a group message typed group with no text', async () => {
    const [message] = await extractWahaMessages(
      body({ id: 'g1', from: '120363000000000000@g.us', fromMe: false, body: 'balance', hasMedia: false, timestamp: 1 })
    );

    expect(message).toMatchObject({ id: 'g1', type: 'group', text: null });
  });

  it('returns status@broadcast typed group with no text', async () => {
    const [message] = await extractWahaMessages(
      body({ id: 's1', from: 'status@broadcast', fromMe: false, body: 'status text', hasMedia: false, timestamp: 1 })
    );

    expect(message).toMatchObject({ id: 's1', type: 'group', text: null });
  });

  it('returns an @lid sender with no text: a hidden id WAHA cannot resolve carries no phone number', async () => {
    const [message] = await extractWahaMessages(
      body({ id: 'l1', from: '98765432109876@lid', fromMe: false, body: 'balance', hasMedia: false, timestamp: 1 })
    );

    expect(message).toMatchObject({ id: 'l1', type: 'text', text: null });
    expect(message.from).toBe('98765432109876@lid');
  });

  it('returns nothing for a payload without an id, or a body without a payload', async () => {
    expect(await extractWahaMessages(body({ from: '2348000000000@c.us', body: 'balance' }))).toEqual([]);
    expect(await extractWahaMessages({ event: 'message' })).toEqual([]);
    expect(await extractWahaMessages(null)).toEqual([]);
    expect(await extractWahaMessages('nope')).toEqual([]);
  });

  it('falls back to the current time when the timestamp is missing', () => {
    const before = Math.floor(Date.now() / 1000);
    const message = wahaMessageToInbound({ id: 'm1', from: '2348000000000@c.us', fromMe: false, body: 'hi' });

    expect(Number(message?.timestamp)).toBeGreaterThanOrEqual(before);
  });

  it('applies the same rules to a chats-store message object (reconciliation)', () => {
    expect(wahaMessageToInbound({ id: 'm1', from: '2348000000000@c.us', fromMe: false, body: 'hi', timestamp: 5, hasMedia: false })).toMatchObject({
      from: '+2348000000000',
      text: 'hi',
    });
    expect(wahaMessageToInbound({ id: 'g', from: '1@g.us', fromMe: false, body: 'hi', timestamp: 5 })).toMatchObject({ type: 'group', text: null });
  });
});

describe('human takeover helpers', () => {
  it('detects a handset message: fromMe with source app', () => {
    expect(isWahaManualOutgoing(body({ fromMe: true, source: 'app', to: '2348000000000@c.us' }, 'message.any'))).toBe(true);
  });

  it.each([
    ['an API send (the bot\'s own reply)', { fromMe: true, source: 'api' }],
    ['an inbound message', { fromMe: false, source: 'app' }],
    ['a fromMe message without a source', { fromMe: true }],
  ])('does not treat %s as a takeover', (_label, payload) => {
    expect(isWahaManualOutgoing(body(payload, 'message.any'))).toBe(false);
  });

  it('extracts the recipient as +digits', () => {
    expect(extractWahaOutgoingRecipient(body({ to: '2348000000000@c.us' }, 'message.any'))).toBe('+2348000000000');
    expect(extractWahaOutgoingRecipient(body({}, 'message.any'))).toBeNull();
  });

  it('uses the one pause length Chatmaid uses', () => {
    expect(WAHA_HUMAN_TAKEOVER_PAUSE_MS).toBe(CHATMAID_HUMAN_TAKEOVER_PAUSE_MS);
  });
});

describe('wahaEventDedupeKey', () => {
  it('keys on the event and the envelope id from the signed body', () => {
    expect(wahaEventDedupeKey('session.status', { id: 'evt_01ABC' }, 'a')).toBe('waha-event:session.status:evt_01ABC');
    // The raw body does not matter once an id is present.
    expect(wahaEventDedupeKey('session.status', { id: 'evt_01ABC' }, 'b')).toBe(
      wahaEventDedupeKey('session.status', { id: 'evt_01ABC' }, 'a')
    );
    expect(wahaEventDedupeKey('session.status', { id: 'evt_02DEF' }, 'a')).not.toBe(
      wahaEventDedupeKey('session.status', { id: 'evt_01ABC' }, 'a')
    );
  });

  it.each([
    ['no id', { event: 'x' }],
    ['a blank id', { id: '  ' }],
    ['a non-string id', { id: 42 }],
    ['a body that is not an object', null],
  ])('falls back to a hash of the raw body for %s, and separates events', (_label, body) => {
    const first = wahaEventDedupeKey('message.ack', body, 'body-1');
    expect(first).toBe(wahaEventDedupeKey('message.ack', body, 'body-1'));
    expect(first).not.toBe(wahaEventDedupeKey('message.ack', body, 'body-2'));
    expect(first).not.toBe(wahaEventDedupeKey('session.status', body, 'body-1'));
    expect(first.startsWith('waha-event:message.ack:body-')).toBe(true);
  });
});

describe('resolveWahaInbound: ignore reasons and @lid senders (#1282)', () => {
  const lidMessage = { id: 'l1', from: '98765432109876@lid', fromMe: false, body: 'balance', hasMedia: false, timestamp: 1 };

  it('answers a @c.us sender as before, with no lookup and no ignore reason', async () => {
    const lookup = vi.fn();
    const inbound = await resolveWahaInbound({ id: 'm1', from: '2348000000000@c.us', fromMe: false, body: 'hi', timestamp: 1 }, lookup);

    expect(inbound).toEqual({ message: expect.objectContaining({ from: '+2348000000000', text: 'hi' }), ignoredReason: null });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves an @lid sender to its phone number and answers it', async () => {
    const lookup = vi.fn(async () => '2348000000000@c.us');
    const inbound = await resolveWahaInbound(lidMessage, lookup);

    expect(lookup).toHaveBeenCalledWith('98765432109876@lid');
    expect(inbound).toEqual({
      message: { id: 'l1', from: '+2348000000000', timestamp: '1', type: 'text', text: 'balance' },
      ignoredReason: null,
    });
  });

  it.each([
    ['WAHA knows no number', null],
    ['WAHA answers with another @lid', '11111111111@lid'],
    ['WAHA answers with a group id', '120363000000000000@g.us'],
  ])('ignores an @lid sender as lid_unresolved when %s', async (_label, answer) => {
    const inbound = await resolveWahaInbound(lidMessage, vi.fn(async () => answer));

    expect(inbound).toEqual({ message: { id: 'l1', from: '98765432109876@lid', timestamp: '1', type: 'text', text: null }, ignoredReason: 'lid_unresolved' });
  });

  it('ignores an @lid sender as lid_unresolved when the lookup fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const inbound = await resolveWahaInbound(lidMessage, vi.fn(async () => { throw new Error('WAHA LID lookup failed (HTTP 500)'); }));

    expect(inbound?.ignoredReason).toBe('lid_unresolved');
  });

  it.each([
    ['group', { from: '120363000000000000@g.us' }, 'group'],
    ['status broadcast', { from: 'status@broadcast' }, 'group'],
    ['fromMe, even from an @lid', { fromMe: true, from: '98765432109876@lid' }, 'from_me'],
    ['another id type', { from: '2348000000000@s.whatsapp.net' }, 'other_id'],
    ['an empty body', { from: '2348000000000@c.us', body: '' }, 'no_text'],
  ])('ignores a %s message with its reason and no lookup', async (_label, overrides, reason) => {
    const lookup = vi.fn();
    const inbound = await resolveWahaInbound({ ...lidMessage, ...overrides }, lookup);

    expect(inbound?.ignoredReason).toBe(reason);
    expect(inbound?.message.text).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('answers 1:1 media (text-only reply), so it has no ignore reason', async () => {
    const inbound = await resolveWahaInbound({ ...lidMessage, from: '2348000000000@c.us', hasMedia: true }, vi.fn());

    expect(inbound).toMatchObject({ message: { type: 'media', text: null }, ignoredReason: null });
  });
});
