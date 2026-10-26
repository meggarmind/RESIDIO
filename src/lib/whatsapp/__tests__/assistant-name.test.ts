import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRawSettingsAsService = vi.fn();
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: (keys: string[]) => getRawSettingsAsService(keys) }));

import { loadAssistantName, resolveAssistantName } from '@/lib/whatsapp/assistant-name';

function withSettings(values: Record<string, unknown>) {
  getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map(Object.entries(values)) });
}

describe('Assistant name (#1201)', () => {
  beforeEach(() => getRawSettingsAsService.mockReset());

  it('uses the trimmed assistant_name when set', async () => {
    withSettings({ assistant_name: ' Ada ', estate_name: 'Palm Estate' });
    await expect(loadAssistantName()).resolves.toBe('Ada');
  });

  it.each([{ assistant_name: '' }, { assistant_name: '  ' }, {}])('falls back to "<estate name> Assistant" for %o', async (values) => {
    withSettings({ ...values, estate_name: 'Palm Estate' });
    await expect(loadAssistantName()).resolves.toBe('Palm Estate Assistant');
  });

  it('falls back to Residio Estate Assistant when nothing is readable', async () => {
    getRawSettingsAsService.mockResolvedValue({ status: 'error', message: 'down' });
    await expect(loadAssistantName()).resolves.toBe('Residio Estate Assistant');
  });

  it('resolves a non-string setting as empty', () => {
    expect(resolveAssistantName(null, 'Palm')).toBe('Palm Assistant');
  });
});
