import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { CHATMAID_HUMAN_TAKEOVER_PAUSE_MS } from '@/lib/whatsapp/providers/chatmaid-inbound';
import {
  WAHA_HUMAN_TAKEOVER_PAUSE_MS,
  extractWahaMessages,
  extractWahaOutgoingRecipient,
  isWahaManualOutgoing,
  verifyWahaSignature,
  wahaEventDedupeKey,
} from '@/lib/whatsapp/providers/waha-inbound';

const SECRET = 'waha-hmac-secret';
const body = JSON.stringify({ event: 'message', payload: { id: 'false_2348000000000@c.us_A1', body: 'hi' } });
/** Independent implementation of WAHA's scheme: hex HMAC-SHA512 of the raw body. */
const sign = (raw: string, secret = SECRET) => createHmac('sha512', secret).update(raw, 'utf8').digest('hex');

function event(payload: Record<string, unknown>, name = 'message') {
  return { id: 'evt_1', timestamp: 1793100000000, event: name, session: 'default', payload };
}

describe('verifyWahaSignature', () => {
  it('accepts the HMAC-SHA512 of the raw body, in either hex case', () => {
    expect(verifyWahaSignature(body, sign(body), 'sha512', SECRET)).toBe(true);
    expect(verifyWahaSignature(body, sign(body).toUpperCase(), 'SHA512', SECRET)).toBe(true);
  });

  it.each([
    ['a wrong secret', sign(body, 'other'), 'sha512', SECRET],
    ['a changed body', sign(`${body} `), 'sha512', SECRET],
    ['a missing header', null, 'sha512', SECRET],
    ['the wrong algorithm', sign(body), 'sha256', SECRET],
    ['a missing algorithm', sign(body), null, SECRET],
    ['a truncated digest', sign(body).slice(0, 64), 'sha512', SECRET],
    ['no secret configured', sign(body, ''), 'sha512', ''],
  ])('rejects %s', (_label, hmac, algorithm, secret) => {
    expect(verifyWahaSignature(body, hmac as string | null, algorithm as string | null, secret as string)).toBe(false);
  });
});

describe('extractWahaMessages', () => {
  it('maps a text message to the canonical shape with unix-seconds time', () => {
    const [message] = extractWahaMessages(
      event({ id: 'false_2348000000000@c.us_A1', timestamp: 1793100000, from: '2348000000000@c.us', fromMe: false, body: 'balance', hasMedia: false })
    );
    expect(message).toEqual({
      id: 'false_2348000000000@c.us_A1',
      from: '+2348000000000',
      timestamp: '1793100000',
      type: 'text',
      text: 'balance',
    });
  });

  it('types a message with media as media, so it gets the text-only reply', () => {
    const [message] = extractWahaMessages(
      event({ id: 'm2', timestamp: 1793100000, from: '2348000000000@c.us', fromMe: false, body: '', hasMedia: true })
    );
    expect(message).toMatchObject({ type: 'media', text: null });
  });

  it.each([
    ['fromMe', { from: '2348000000000@c.us', fromMe: true }, 'text'],
    ['a group', { from: '120363000000000000@g.us', fromMe: false }, 'group'],
    ['a status broadcast', { from: 'status@broadcast', fromMe: false }, 'group'],
    ['an @lid sender', { from: '123456789012345@lid', fromMe: false }, 'text'],
  ])('returns %s with no text, so it is counted as ignored', (_label, fields, type) => {
    const [message] = extractWahaMessages(event({ id: 'm3', timestamp: 1793100000, body: 'hello', hasMedia: true, ...fields }));
    expect(message).toMatchObject({ id: 'm3', type, text: null });
  });

  it('drops a message without an id', () => {
    expect(extractWahaMessages(event({ from: '2348000000000@c.us', body: 'x' }))).toEqual([]);
  });
});

describe('manual outgoing', () => {
  it('is a human typing only when fromMe and source is app', () => {
    expect(isWahaManualOutgoing(event({ fromMe: true, source: 'app', to: '2348000000000@c.us' }, 'message.any'))).toBe(true);
    expect(isWahaManualOutgoing(event({ fromMe: true, source: 'api', to: '2348000000000@c.us' }, 'message.any'))).toBe(false);
    expect(isWahaManualOutgoing(event({ fromMe: false, source: 'app' }, 'message.any'))).toBe(false);
  });

  it('reads the recipient as +digits', () => {
    expect(extractWahaOutgoingRecipient(event({ to: '2348000000000@c.us' }))).toBe('+2348000000000');
  });

  it('uses the one Chatmaid pause length', () => {
    expect(WAHA_HUMAN_TAKEOVER_PAUSE_MS).toBe(CHATMAID_HUMAN_TAKEOVER_PAUSE_MS);
  });
});

describe('wahaEventDedupeKey', () => {
  it('keys on the request id, and on the body without one', () => {
    expect(wahaEventDedupeKey('session.status', 'req-1')).toBe('waha-event:session.status:req-1');
    expect(wahaEventDedupeKey('session.status', null, 'a')).toBe(wahaEventDedupeKey('session.status', null, 'a'));
    expect(wahaEventDedupeKey('session.status', null, 'a')).not.toBe(wahaEventDedupeKey('session.status', null, 'b'));
  });
});
