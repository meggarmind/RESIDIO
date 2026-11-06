import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  settings: {} as Record<string, unknown>,
  insert: vi.fn(),
  termiiConfigured: true,
}));

vi.mock('@/lib/settings/service', () => ({
  getSettingValueAsService: vi.fn(async (key: string) => mocks.settings[key] ?? null),
}));
vi.mock('@/lib/comms-override/gate', () => ({
  decideSend: async () => ({ result: { redirect: false }, envLabel: 'TEST' }),
  loadSnapshotFor: async () => ({ status: 'error', message: 'unused' }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({ from: () => ({ insert: mocks.insert }) }),
}));
vi.mock('@/lib/sms/termii', () => ({
  termiiConfig: { apiKey: 'termii-key', senderId: 'Residio', baseUrl: 'https://termii.test/api' },
  isSmsConfigured: () => mocks.termiiConfigured,
  formatPhoneForTermii: (phone: string) => phone.replace(/^\+/, ''),
}));

import { sendSms } from '@/lib/sms/send-sms';
import { getActiveSmsProvider } from '@/lib/sms/provider';

const TERMII_OK = () => new Response(JSON.stringify({ code: 'ok', message_id: 'termii-1', balance: 42 }), { status: 200 });
const HOLLA_OK = () => new Response('1,holla-1', { status: 200 });

function urlsCalled(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0]));
}

function loggedMetadata(): Record<string, unknown> {
  expect(mocks.insert).toHaveBeenCalledTimes(1);
  return mocks.insert.mock.calls[0][0].metadata;
}

const send = () =>
  sendSms({ to: { phone: '+2348030000000' }, message: 'Hello', smsType: 'notification' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings = { sms_enabled: true };
  mocks.termiiConfigured = true;
  mocks.insert.mockResolvedValue({ data: null, error: null });
  vi.stubEnv('HOLLATAGS_USERNAME', 'holla-user');
  vi.stubEnv('HOLLATAGS_PASSWORD', 'holla-pass');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getActiveSmsProvider', () => {
  it('is Termii when sms_provider is unset', async () => {
    expect((await getActiveSmsProvider()).name).toBe('termii');
  });

  it('is HollaTags when sms_provider is "hollatags"', async () => {
    mocks.settings.sms_provider = 'hollatags';
    expect((await getActiveSmsProvider()).name).toBe('hollatags');
  });

  it('is Termii for "termii" and for an unknown value', async () => {
    mocks.settings.sms_provider = 'termii';
    expect((await getActiveSmsProvider()).name).toBe('termii');
    mocks.settings.sms_provider = 'twilio';
    expect((await getActiveSmsProvider()).name).toBe('termii');
    mocks.settings.sms_provider = true;
    expect((await getActiveSmsProvider()).name).toBe('termii');
  });
});

describe('sendSms provider selection', () => {
  it('sends through Termii when sms_provider is unset, and logs provider termii with balance', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => TERMII_OK());
    vi.stubGlobal('fetch', fetchMock);

    const result = await send();

    expect(result).toEqual({ success: true, messageId: 'termii-1', balance: 42 });
    expect(urlsCalled(fetchMock)).toEqual(['https://termii.test/api/sms/send']);
    expect(loggedMetadata()).toMatchObject({ provider: 'termii', balance: 42 });
  });

  it('sends through HollaTags when chosen, logs provider hollatags and sets no balance', async () => {
    mocks.settings.sms_provider = 'hollatags';
    const fetchMock = vi.fn().mockImplementation(async () => HOLLA_OK());
    vi.stubGlobal('fetch', fetchMock);

    const result = await send();

    expect(result).toEqual({ success: true, messageId: 'holla-1' });
    expect(result).not.toHaveProperty('balance');
    expect(urlsCalled(fetchMock)).toEqual(['https://sms.hollatags.com/api/send/']);
    const metadata = loggedMetadata();
    expect(metadata.provider).toBe('hollatags');
    expect(metadata).not.toHaveProperty('balance');
    expect(mocks.insert.mock.calls[0][0].external_id).toBe('holla-1');
  });

  it('logs the failed HollaTags send under provider hollatags', async () => {
    mocks.settings.sms_provider = 'hollatags';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error_credit', { status: 200 })));

    const result = await send();

    expect(result.success).toBe(false);
    expect(result.error).toContain('error_credit');
    expect(loggedMetadata().provider).toBe('hollatags');
    expect(mocks.insert.mock.calls[0][0].status).toBe('failed');
  });

  it('uses Termii for an unknown provider value', async () => {
    mocks.settings.sms_provider = 'nonsense';
    const fetchMock = vi.fn().mockImplementation(async () => TERMII_OK());
    vi.stubGlobal('fetch', fetchMock);

    await send();

    expect(urlsCalled(fetchMock)).toEqual(['https://termii.test/api/sms/send']);
  });

  it('fails with the HollaTags error, and calls no one, when HollaTags is chosen without credentials', async () => {
    mocks.settings.sms_provider = 'hollatags';
    vi.stubEnv('HOLLATAGS_PASSWORD', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await send();

    expect(result).toEqual({
      success: false,
      error: 'SMS service not configured (missing HOLLATAGS_USERNAME or HOLLATAGS_PASSWORD)',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with the Termii error, and calls no one, when Termii is chosen without a key (HollaTags is configured)', async () => {
    mocks.termiiConfigured = false;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await send();

    expect(result).toEqual({ success: false, error: 'SMS service not configured (missing TERMII_API_KEY)' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still honours sms_enabled = false before any provider work', async () => {
    mocks.settings.sms_enabled = false;
    mocks.settings.sms_provider = 'hollatags';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await send()).toEqual({ success: false, error: 'SMS notifications are disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
