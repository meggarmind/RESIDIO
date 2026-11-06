import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hollatagsProvider } from '@/lib/sms/providers/hollatags';

const PASSWORD = 'super-secret-pw';

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

function stubFetch(body: string, status = 200) {
  // A fresh Response per call: a body can be read once.
  const fetchMock = vi.fn().mockImplementation(async () => textResponse(body, status));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentParams(fetchMock: ReturnType<typeof vi.fn>): URLSearchParams {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(init.body).toBeInstanceOf(URLSearchParams);
  return init.body as URLSearchParams;
}

beforeEach(() => {
  vi.stubEnv('HOLLATAGS_USERNAME', 'residio-user');
  vi.stubEnv('HOLLATAGS_PASSWORD', PASSWORD);
  vi.stubEnv('HOLLATAGS_SENDER_ID', '');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('hollatagsProvider.isConfigured', () => {
  it('needs both username and password', () => {
    expect(hollatagsProvider.isConfigured()).toBe(true);
    vi.stubEnv('HOLLATAGS_PASSWORD', '');
    expect(hollatagsProvider.isConfigured()).toBe(false);
    vi.stubEnv('HOLLATAGS_PASSWORD', PASSWORD);
    vi.stubEnv('HOLLATAGS_USERNAME', '');
    expect(hollatagsProvider.isConfigured()).toBe(false);
  });
});

describe('hollatagsProvider.send request', () => {
  it('posts a form-encoded body to the HollaTags endpoint', async () => {
    const fetchMock = stubFetch('sent');
    await hollatagsProvider.send({ to: '+2348030000000', message: 'Hello' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://sms.hollatags.com/api/send/');
    expect(init.method).toBe('POST');
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const p = sentParams(fetchMock);
    expect(p.get('user')).toBe('residio-user');
    expect(p.get('pass')).toBe(PASSWORD);
    expect(p.get('from')).toBe('Residio');
    expect(p.get('to')).toBe('2348030000000');
    expect(p.get('msg')).toBe('Hello');
    expect(p.get('type')).toBe('0');
    expect(p.get('enable_msg_id')).toBe('TRUE');
    expect(p.get('message_uuid')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('formats a local number without a plus sign', async () => {
    const fetchMock = stubFetch('sent');
    await hollatagsProvider.send({ to: '08030000000', message: 'Hello' });
    expect(sentParams(fetchMock).get('to')).toBe('2348030000000');
  });

  it('uses HOLLATAGS_SENDER_ID when set', async () => {
    vi.stubEnv('HOLLATAGS_SENDER_ID', 'MyEstate');
    const fetchMock = stubFetch('sent');
    await hollatagsProvider.send({ to: '+2348030000000', message: 'Hello' });
    expect(sentParams(fetchMock).get('from')).toBe('MyEstate');
  });

  it('uses a new message_uuid for every send', async () => {
    const fetchMock = stubFetch('sent');
    await hollatagsProvider.send({ to: '+2348030000000', message: 'One' });
    await hollatagsProvider.send({ to: '+2348030000000', message: 'Two' });
    const first = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    const second = (fetchMock.mock.calls[1][1] as RequestInit).body as URLSearchParams;
    expect(first.get('message_uuid')).not.toBe(second.get('message_uuid'));
  });

  it('sends type 0 for GSM text and type 2 for non-GSM characters', async () => {
    const fetchMock = stubFetch('sent');
    await hollatagsProvider.send({ to: '+2348030000000', message: 'Your code is 123456. Thank you!' });
    expect(sentParams(fetchMock).get('type')).toBe('0');

    fetchMock.mockClear();
    await hollatagsProvider.send({ to: '+2348030000000', message: 'Dues paid ✅' });
    expect(sentParams(fetchMock).get('type')).toBe('2');
  });
});

describe('hollatagsProvider.send response', () => {
  it('treats "sent" as success with no message id', async () => {
    stubFetch('sent\n');
    expect(await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' })).toEqual({ success: true });
  });

  it('reads the id of a single "<digits>,<id>" reply', async () => {
    stubFetch('1,abc123');
    expect(await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' })).toEqual({
      success: true,
      messageId: 'abc123',
    });
  });

  it('reads the first id of a "~~" joined reply', async () => {
    stubFetch('1,first-id~~1,second-id~~2,third-id');
    expect(await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' })).toEqual({
      success: true,
      messageId: 'first-id',
    });
  });

  it.each([
    ['error_param', 'missing or invalid parameters'],
    ['error_credit', 'insufficient HollaTags credit'],
    ['error_billing', 'could not debit the account (temporary)'],
    ['error_gw', 'gateway unavailable'],
    ['error_user', 'invalid HollaTags username/password or suspended account'],
    ['error_limit', 'invalid number or too many recipients'],
  ])('maps %s to a readable error that keeps the token', async (token, reason) => {
    stubFetch(token);
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result.success).toBe(false);
    expect(result.error).toContain(reason);
    expect(result.error).toContain(token);
  });

  it('keeps the raw token of an unknown error_ code', async () => {
    stubFetch('error_new');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result).toEqual({ success: false, error: 'HollaTags error (error_new)' });
  });

  it('fails on an unexpected body', async () => {
    stubFetch('<html>maintenance</html>');
    expect(await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' })).toEqual({
      success: false,
      error: 'Unexpected HollaTags response',
    });
  });

  it('does not read a body that merely starts with digits as success', async () => {
    stubFetch('1,abc 2,def');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result.success).toBe(false);
  });

  it('fails with the status on a non-OK reply, even when the body says sent', async () => {
    stubFetch('sent', 502);
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('502');
  });

  it('never puts the password in an error', async () => {
    const bodies: Array<[string, number]> = [
      ['error_user', 200],
      [`oops ${PASSWORD}`, 200],
      ['bad', 500],
    ];
    for (const [body, status] of bodies) {
      stubFetch(body, status);
      const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
      expect(result.success).toBe(false);
      expect(result.error).not.toContain(PASSWORD);
    }
  });
});

describe('hollatagsProvider.send limits', () => {
  it('rejects a message over 905 characters without calling HollaTags', async () => {
    const fetchMock = stubFetch('sent');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'a'.repeat(906) });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/905/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a message of exactly 905 characters', async () => {
    const fetchMock = stubFetch('sent');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'a'.repeat(905) });
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a sender ID over 11 characters without calling HollaTags', async () => {
    vi.stubEnv('HOLLATAGS_SENDER_ID', 'TwelveChars!');
    const fetchMock = stubFetch('sent');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/HOLLATAGS_SENDER_ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a sender ID of exactly 11 characters', async () => {
    vi.stubEnv('HOLLATAGS_SENDER_ID', 'ElevenChars');
    const fetchMock = stubFetch('sent');
    const result = await hollatagsProvider.send({ to: '+2348030000000', message: 'Hi' });
    expect(result.success).toBe(true);
    expect(sentParams(fetchMock).get('from')).toBe('ElevenChars');
  });
});
