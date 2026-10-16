import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Json } from '@/types/database.generated';

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: mocks.createAdminClient,
  createServerSupabaseClient: vi.fn(),
}));

import { getRawSettingsAsService, readSetting } from '@/lib/settings/service';
import { loadOverrideSettings, parseOverrideSettings, parseSwitch, OVERRIDE_SETTING_KEYS } from '@/lib/comms-override/settings';

function clientReturning(rows: Array<{ key: string; value: Json }> | null, error: { message: string } | null = null) {
  return {
    from: () => ({
      select: () => ({
        in: async () => ({ data: rows, error }),
        eq: () => ({ maybeSingle: async () => ({ data: rows?.[0] ?? null, error }) }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('phone settings keep their string value', () => {
  it.each(['08012345678', '+2348012345678'])('getRawSettingsAsService returns %s as the same string', async (phone) => {
    const client = clientReturning([{ key: 'comms_override_phone', value: phone }]);
    const result = await getRawSettingsAsService(['comms_override_phone'], client as never);
    if (result.status !== 'ok') throw new Error('expected ok');
    expect(result.values.get('comms_override_phone')).toBe(phone);
  });

  it('shows the trap: the coercing reader turns 08012345678 into a number and "" into 0', async () => {
    const phone = await readSetting(clientReturning([{ key: 'k', value: '08012345678' }]) as never, 'k');
    expect(phone).toEqual({ status: 'ok', value: 8012345678 });
    const blank = await readSetting(clientReturning([{ key: 'k', value: '' }]) as never, 'k');
    expect(blank).toEqual({ status: 'ok', value: 0 });
  });

  it.each(['08012345678', '+2348012345678'])('loadOverrideSettings returns %s unchanged', async (phone) => {
    mocks.createAdminClient.mockReturnValue(
      clientReturning([
        { key: OVERRIDE_SETTING_KEYS.phone, value: phone },
        { key: OVERRIDE_SETTING_KEYS.whatsappPhone, value: phone },
      ])
    );
    const snapshot = await loadOverrideSettings();
    if (snapshot.status !== 'ok') throw new Error('expected ok');
    expect(snapshot.settings.phone).toBe(phone);
    expect(snapshot.settings.whatsappPhone).toBe(phone);
  });
});

describe('loadOverrideSettings', () => {
  it('returns an error snapshot when the query errors', async () => {
    mocks.createAdminClient.mockReturnValue(clientReturning(null, { message: 'connection reset' }));
    expect(await loadOverrideSettings()).toEqual({ status: 'error', message: 'connection reset' });
  });

  it('returns an error snapshot instead of throwing when the client cannot be built', async () => {
    mocks.createAdminClient.mockImplementation(() => {
      throw new Error('missing service key');
    });
    expect(await loadOverrideSettings()).toEqual({ status: 'error', message: 'missing service key' });
  });

  it('treats absent rows as defaults: switch off, values blank, debug off', async () => {
    mocks.createAdminClient.mockReturnValue(clientReturning([]));
    expect(await loadOverrideSettings()).toEqual({
      status: 'ok',
      settings: { enabled: false, email: '', phone: '', whatsappPhone: '', debugMode: false, debugExpiresAt: null },
    });
  });
});

describe('parsing', () => {
  it('reads switches stored as booleans or strings', () => {
    expect(parseSwitch(true)).toBe(true);
    expect(parseSwitch('true')).toBe(true);
    expect(parseSwitch(false)).toBe(false);
    expect(parseSwitch('false')).toBe(false);
    expect(parseSwitch(undefined)).toBe(false);
  });

  it('counts an unrecognised switch value as ON so corruption can only widen the redirect', () => {
    expect(parseSwitch('maybe')).toBe(true);
    expect(parseSwitch(7)).toBe(true);
  });

  it('treats a numeric phone (leading zero already lost) as blank rather than guessing', () => {
    const settings = parseOverrideSettings(new Map<string, Json>([[OVERRIDE_SETTING_KEYS.phone, 8012345678]]));
    expect(settings.phone).toBe('');
  });
});
