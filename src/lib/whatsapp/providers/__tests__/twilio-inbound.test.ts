import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractTwilioMessages, verifyTwilioSignature } from '@/lib/whatsapp/providers/twilio';
import { extractWhatsAppMessages } from '@/lib/whatsapp/inbound';

const authToken = 'test-auth-token';
const url = 'https://residio.test/api/whatsapp/webhook/twilio';
const params = {
  MessageSid: 'SM123',
  From: 'whatsapp:+2348000000000',
  Body: 'Hello',
};

/**
 * Twilio's signing algorithm, reimplemented independently in the test so the
 * "known-good signature verifies" case is not just checking the
 * implementation against itself. The hardcoded `EXPECTED_SIGNATURE` below is
 * the belt-and-suspenders check: it was computed once, offline, with this
 * exact algorithm, so a bug that makes this helper and the implementation
 * wrong in the same way still can't make the test pass.
 */
function signTwilioParams(requestUrl: string, requestParams: Record<string, string>, token: string): string {
  const payload = Object.keys(requestParams)
    .sort()
    .reduce((acc, key) => acc + key + requestParams[key], requestUrl);
  return createHmac('sha1', token).update(payload, 'utf8').digest('base64');
}

const EXPECTED_SIGNATURE = 'Gt8se7Aile7HYpHKr3LZtwu956A=';

describe('verifyTwilioSignature', () => {
  it('verifies a known-good signature against a hardcoded expected value', () => {
    const signature = signTwilioParams(url, params, authToken);

    expect(signature).toBe(EXPECTED_SIGNATURE);
    expect(verifyTwilioSignature(url, params, authToken, signature)).toBe(true);
  });

  it('rejects a signature when any single param is tampered with', () => {
    const signature = signTwilioParams(url, params, authToken);

    expect(verifyTwilioSignature(url, { ...params, Body: 'Goodbye' }, authToken, signature)).toBe(false);
    expect(
      verifyTwilioSignature(url, { ...params, MessageSid: 'SM999' }, authToken, signature)
    ).toBe(false);
    expect(
      verifyTwilioSignature(url, { ...params, From: 'whatsapp:+15550000000' }, authToken, signature)
    ).toBe(false);
  });

  it('rejects a signature computed with the wrong auth token', () => {
    const signature = signTwilioParams(url, params, 'a-different-auth-token');

    expect(verifyTwilioSignature(url, params, authToken, signature)).toBe(false);
  });

  it('returns false, without throwing, for a missing header', () => {
    expect(() => verifyTwilioSignature(url, params, authToken, null)).not.toThrow();
    expect(verifyTwilioSignature(url, params, authToken, null)).toBe(false);
  });

  it('returns false, without throwing, for a missing auth token', () => {
    const signature = signTwilioParams(url, params, authToken);

    expect(() => verifyTwilioSignature(url, params, '', signature)).not.toThrow();
    expect(verifyTwilioSignature(url, params, '', signature)).toBe(false);
  });

  it('produces the same signature regardless of key insertion order, proving the params are sorted', () => {
    const signature = signTwilioParams(url, params, authToken);

    const reordered = {
      Body: params.Body,
      MessageSid: params.MessageSid,
      From: params.From,
    };

    expect(verifyTwilioSignature(url, reordered, authToken, signature)).toBe(true);
  });
});

describe('extractTwilioMessages', () => {
  it('strips the whatsapp: prefix from From and produces the canonical inbound shape', () => {
    const messages = extractTwilioMessages({
      MessageSid: 'SM123',
      From: 'whatsapp:+2348000000000',
      Body: 'Hello',
    });

    expect(messages).toEqual([
      {
        id: 'SM123',
        from: '+2348000000000',
        timestamp: expect.any(String),
        type: 'text',
        text: 'Hello',
      },
    ]);
  });

  it('produces the same canonical shape as the Meta parser for an equivalent message', () => {
    const [twilioMessage] = extractTwilioMessages({
      MessageSid: 'wamid.equivalent-1',
      From: 'whatsapp:+2348000000000',
      Body: 'Hello',
    });

    const [metaMessage] = extractWhatsAppMessages({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: 'wamid.equivalent-1',
                    // Written in E.164 (+ prefix) so it is byte-for-byte the
                    // same value Twilio's `From` yields once `whatsapp:` is
                    // stripped -- Meta's Cloud API in practice omits the `+`,
                    // but that is a Meta payload-shape detail, not something
                    // this equivalence check is about.
                    from: '+2348000000000',
                    timestamp: '1760000000',
                    type: 'text',
                    text: { body: 'Hello' },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    // Same shape (all the same keys), and -- the part that actually matters
    // for downstream identity lookup -- the same `from`, `type` and `text`,
    // despite arriving through entirely different wire formats.
    expect(Object.keys(twilioMessage).sort()).toEqual(Object.keys(metaMessage).sort());
    expect(twilioMessage.from).toBe(metaMessage.from);
    expect(twilioMessage.type).toBe(metaMessage.type);
    expect(twilioMessage.text).toBe(metaMessage.text);
  });

  it('returns an empty array when MessageSid is absent', () => {
    expect(extractTwilioMessages({ From: 'whatsapp:+2348000000000', Body: 'Hello' })).toEqual([]);
  });

  it('returns null text for an absent or empty Body', () => {
    const [noBody] = extractTwilioMessages({ MessageSid: 'SM124', From: 'whatsapp:+2348000000000' });
    expect(noBody.text).toBeNull();

    const [emptyBody] = extractTwilioMessages({
      MessageSid: 'SM125',
      From: 'whatsapp:+2348000000000',
      Body: '',
    });
    expect(emptyBody.text).toBeNull();
  });
});
