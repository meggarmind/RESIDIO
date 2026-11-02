import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendSms } from '@/lib/sms/send-sms';
import { initializeTransaction, verifyTransaction } from '@/lib/paystack/client';
import {
  createChatmaidWhatsAppProvider,
  fetchChatmaidConnectionStatus,
  lookupChatmaidPhone,
} from '@/lib/whatsapp/providers/chatmaid';
import { createWahaWhatsAppProvider, lookupWahaPhone } from '@/lib/whatsapp/providers/waha';
import { createMetaWhatsAppProvider } from '@/lib/whatsapp/providers/meta';
import { createTwilioWhatsAppProvider } from '@/lib/whatsapp/providers/twilio';
import { disconnectGmail } from '@/actions/email-imports/gmail-oauth';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type {
  ChatmaidWhatsAppConfig,
  MetaWhatsAppConfig,
  TwilioWhatsAppConfig,
  WahaWhatsAppConfig,
} from '@/lib/whatsapp/config';

vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn().mockResolvedValue(true),
  getRawSettingsAsService: async () => ({ status: 'ok', values: new Map([['estate_name', 'Opera Estate']]) }),
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(() => ({ from: () => ({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) }) })),
  createServerSupabaseClient: vi.fn(),
}));
vi.mock('@/lib/sms/termii', () => ({
  termiiConfig: { apiKey: 'k', senderId: 'Residio', baseUrl: 'https://termii.test/api' },
  isSmsConfigured: vi.fn(() => true),
  formatPhoneForTermii: vi.fn((phone: string) => phone.replace(/^\+/, '')),
}));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn().mockResolvedValue({ authorized: true }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/email-imports/gmail-client', () => ({
  getGmailAuthUrl: vi.fn(),
  exchangeAuthCode: vi.fn(),
  getGmailClient: vi.fn(),
  GMAIL_SCOPES: [],
  GMAIL_OAUTH_STATE_COOKIE: 'c',
  GMAIL_OAUTH_STATE_COOKIE_PATH: '/',
  GMAIL_OAUTH_STATE_TTL_SECONDS: 1,
  createGmailOAuthState: vi.fn(),
  verifyGmailOAuthState: vi.fn(),
}));
vi.mock('@/lib/email-imports/oauth-encryption', () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(() => 'access-token'),
}));
vi.mock('@/lib/email-imports/import-rules', () => ({ validateImportRules: vi.fn() }));

const timeoutError = () => new DOMException('timeout', 'TimeoutError');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Asserts every fetch call carried an AbortSignal. */
function expectSignals(fetchMock: ReturnType<typeof vi.fn>, count: number) {
  expect(fetchMock).toHaveBeenCalledTimes(count);
  for (const call of fetchMock.mock.calls) {
    expect((call[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  }
}

let counter = 0;
function chatmaidConfig(): ChatmaidWhatsAppConfig {
  counter += 1;
  return {
    provider: 'chatmaid',
    apiKey: 'sk_test',
    webhookSecret: 'wh',
    fromNumber: '+2348037000101',
    baseUrl: `https://chatmaid.test/${counter}`,
  };
}
function wahaConfig(): WahaWhatsAppConfig {
  counter += 1;
  return {
    provider: 'waha',
    apiKey: 'waha-key',
    webhookSecret: 'wh',
    baseUrl: `https://waha.test/${counter}`,
    session: 'default',
    fromNumber: '+2348037000101',
  };
}
const metaConfig: MetaWhatsAppConfig = {
  provider: 'meta',
  accessToken: 't',
  phoneNumberId: '123',
  verifyToken: 'v',
  appSecret: 's',
  apiVersion: 'v20.0',
  graphBaseUrl: 'https://graph.test',
};
const twilioConfig: TwilioWhatsAppConfig = {
  provider: 'twilio',
  accountSid: 'AC1',
  authToken: 'tok',
  fromNumber: '+15550001111',
  templateContentSids: { invoice_reminder: 'HX1' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Termii send (#1438)', () => {
  const send = () =>
    sendSms({ to: { phone: '+2348000000000' }, message: 'Hi', smsType: 'notification' });

  it('passes an AbortSignal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ code: 'ok', message_id: 'm1' }));
    vi.stubGlobal('fetch', fetchMock);
    await send();
    expectSignals(fetchMock, 1);
  });

  it('turns a timeout into the existing failure result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    expect(await send()).toMatchObject({ success: false, error: 'timeout' });
  });
});

describe('Paystack (#1438)', () => {
  beforeEach(() => {
    vi.stubEnv('PAYSTACK_SECRET_KEY', 'sk_test');
  });

  it('initialize passes an AbortSignal and maps a timeout to a failure result', async () => {
    const ok = vi.fn().mockResolvedValue(json({ status: true, data: {} }));
    vi.stubGlobal('fetch', ok);
    await initializeTransaction({ email: 'a@b.test', amount: 100 } as never);
    expectSignals(ok, 1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    expect(await initializeTransaction({ email: 'a@b.test', amount: 100 } as never)).toEqual({
      status: false,
      message: 'timeout',
    });
  });

  it('verify passes an AbortSignal and maps a timeout to a failure result', async () => {
    const ok = vi.fn().mockResolvedValue(json({ status: true, data: {} }));
    vi.stubGlobal('fetch', ok);
    await verifyTransaction('ref-1');
    expectSignals(ok, 1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    expect(await verifyTransaction('ref-1')).toEqual({ status: false, message: 'timeout' });
  });
});

describe('Chatmaid (#1438)', () => {
  it('phone lookup passes a signal and lets a timeout propagate (caller owns the message)', async () => {
    const config = chatmaidConfig();
    const ok = vi.fn().mockResolvedValue(json({ data: [] }));
    await lookupChatmaidPhone(config, ok);
    expectSignals(ok, 1);

    await expect(lookupChatmaidPhone(config, vi.fn().mockRejectedValue(timeoutError()))).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('status read passes a signal and lets a timeout propagate', async () => {
    const config = chatmaidConfig();
    const ok = vi.fn().mockResolvedValue(json({ connectionStatus: 'connected' }));
    await fetchChatmaidConnectionStatus(config, 'p1', ok);
    expectSignals(ok, 1);

    await expect(
      fetchChatmaidConnectionStatus(config, 'p1', vi.fn().mockRejectedValue(timeoutError()))
    ).rejects.toMatchObject({ name: 'TimeoutError' });
  });

  it('send path passes a signal on list, status and send', async () => {
    const config = chatmaidConfig();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'phone-1', e164: config.fromNumber }] }))
      .mockResolvedValueOnce(json({ connectionStatus: 'connected' }))
      .mockResolvedValueOnce(json({ data: { id: 'msg_1' } }, 201));
    const result = await createChatmaidWhatsAppProvider(config, fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: true, messageId: 'msg_1' });
    expectSignals(fetchImpl, 3);
  });

  it('a timeout on the list read reports the bridge as disconnected', async () => {
    const result = await createChatmaidWhatsAppProvider(
      chatmaidConfig(),
      vi.fn().mockRejectedValue(timeoutError())
    ).sendText({ to: '+2348000000000', body: 'Hi' });
    expect(result).toEqual({ success: false, error: 'Chatmaid bridge is disconnected' });
  });

  it('a timeout on the status read reports the bridge as disconnected', async () => {
    const config = chatmaidConfig();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'phone-1', e164: config.fromNumber }] }))
      .mockRejectedValueOnce(timeoutError());
    const result = await createChatmaidWhatsAppProvider(config, fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: false, error: 'Chatmaid bridge is disconnected' });
  });

  it('a timeout on the send is a retryable provider failure', async () => {
    const config = chatmaidConfig();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ id: 'phone-1', e164: config.fromNumber }] }))
      .mockResolvedValueOnce(json({ connectionStatus: 'connected' }))
      .mockRejectedValueOnce(timeoutError());
    const result = await createChatmaidWhatsAppProvider(config, fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: false, error: 'Chatmaid provider request failed', retryable: true });
  });
});

describe('WAHA (#1438)', () => {
  const working = () => json({ name: 'default', status: 'WORKING', me: { id: '2348037000101@c.us' } });

  it('session status read passes a signal and lets a timeout propagate', async () => {
    const config = wahaConfig();
    const ok = vi.fn().mockResolvedValue(working());
    await lookupWahaPhone(config, ok);
    expectSignals(ok, 1);

    await expect(lookupWahaPhone(config, vi.fn().mockRejectedValue(timeoutError()))).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });

  it('send path passes a signal on the status read and the send', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(working())
      .mockResolvedValueOnce(json({ id: 'wa-1' }, 201));
    const result = await createWahaWhatsAppProvider(wahaConfig(), fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: true, messageId: 'wa-1' });
    expectSignals(fetchImpl, 2);
  });

  it('a timeout on the status read reports the bridge as disconnected', async () => {
    const result = await createWahaWhatsAppProvider(wahaConfig(), vi.fn().mockRejectedValue(timeoutError())).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: false, error: 'WAHA bridge is disconnected' });
  });

  it('a timeout on the send is a retryable provider failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(working()).mockRejectedValueOnce(timeoutError());
    const result = await createWahaWhatsAppProvider(wahaConfig(), fetchImpl).sendText({
      to: '+2348000000000',
      body: 'Hi',
    });
    expect(result).toEqual({ success: false, error: 'WAHA provider request failed', retryable: true });
  });
});

describe('Meta (#1438)', () => {
  it('text and template sends pass a signal', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => json({ messages: [{ id: 'w1' }] }));
    const provider = createMetaWhatsAppProvider(metaConfig, fetchImpl);
    await provider.sendText({ to: '2348000000000', body: 'Hi' });
    await provider.sendTemplate({
      to: '2348000000000',
      templateName: 't',
      languageCode: 'en',
      parameters: [],
    } as never);
    expectSignals(fetchImpl, 2);
  });

  it('a timeout still rejects as a thrown error, as any network error did', async () => {
    const provider = createMetaWhatsAppProvider(metaConfig, vi.fn().mockRejectedValue(timeoutError()));
    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
});

describe('Twilio (#1438)', () => {
  it('passes a signal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ sid: 'SM1' }));
    await createTwilioWhatsAppProvider(twilioConfig, fetchImpl).sendText({ to: '2348000000000', body: 'Hi' });
    expectSignals(fetchImpl, 1);
  });

  it('a timeout still rejects as a thrown error, as any network error did', async () => {
    const provider = createTwilioWhatsAppProvider(twilioConfig, vi.fn().mockRejectedValue(timeoutError()));
    await expect(provider.sendText({ to: '2348000000000', body: 'Hi' })).rejects.toMatchObject({
      name: 'TimeoutError',
    });
  });
});

describe('Gmail token revoke (#1438)', () => {
  function mockSupabase() {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: 'c1', email_address: 'a@b.test', access_token_encrypted: 'enc' },
            }),
          }),
        }),
        update: () => ({ eq: async () => ({ error: null }) }),
      }),
    } as never);
  }

  it('passes a signal to the revoke call', async () => {
    mockSupabase();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await disconnectGmail();
    expectSignals(fetchMock, 1);
  });

  it('a revoke timeout is best effort: the disconnect still completes', async () => {
    mockSupabase();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeoutError()));
    expect(await disconnectGmail()).toEqual({ error: null });
  });
});
