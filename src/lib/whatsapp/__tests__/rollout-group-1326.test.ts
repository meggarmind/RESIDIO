import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { getSettingResultAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';

vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/config', () => ({ resolveWhatsAppConfig: vi.fn() }));

const GROUP = '1203@g.us';

function settings(overrides: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = {
    whatsapp_rollout_mode: 'group',
    whatsapp_estate_group_id: GROUP,
    whatsapp_pilot_resident_ids: JSON.stringify([]),
    ...overrides,
  };
  vi.mocked(getSettingResultAsService).mockImplementation(async (key) => {
    const value = values[key];
    if (value && typeof value === 'object' && 'status' in value) return value as never;
    return value === undefined ? { status: 'absent' } : { status: 'ok', value: value as string };
  });
}

function members(result: { data?: unknown; error?: unknown }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const name of ['select', 'eq', 'is', 'limit']) chain[name] = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  const from = vi.fn().mockReturnValue(chain);
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { chain, from };
}

describe('WhatsApp rollout mode group (#1326)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: { provider: 'waha' } } as never);
  });

  it('allows a current member of the chosen group', async () => {
    settings();
    const { chain, from } = members({ data: [{ id: 'm1' }], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
    expect(from).toHaveBeenCalledWith('whatsapp_group_members');
    expect(chain.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
    expect(chain.eq).toHaveBeenCalledWith('group_id', GROUP);
    expect(chain.is).toHaveBeenCalledWith('left_at', null);
  });

  it('refuses a resident who is not a member', async () => {
    settings();
    members({ data: [], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('allows a pilot-list resident without a member lookup', async () => {
    settings({ whatsapp_pilot_resident_ids: JSON.stringify(['resident-1']) });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('does not use the pilot street in group mode', async () => {
    settings({ whatsapp_pilot_street_id: 'street-1' });
    members({ data: [], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('fails closed when WAHA is not the active provider, even for a member or pilot resident', async () => {
    settings({ whatsapp_pilot_resident_ids: JSON.stringify(['resident-1']) });
    const { from } = members({ data: [{ id: 'm1' }], error: null });
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: { provider: 'meta' } } as never);
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'unconfigured' } as never);
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when the provider lookup throws', async () => {
    settings();
    members({ data: [{ id: 'm1' }], error: null });
    vi.mocked(resolveWhatsAppConfig).mockRejectedValue(new Error('boom'));
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('fails closed when no group is chosen', async () => {
    settings({ whatsapp_estate_group_id: '  ' });
    const { from } = members({ data: [{ id: 'm1' }], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when the group setting read errors', async () => {
    settings({ whatsapp_estate_group_id: { status: 'error', message: 'reset' } });
    members({ data: [{ id: 'm1' }], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('fails closed when the pilot list read errors', async () => {
    settings({ whatsapp_pilot_resident_ids: { status: 'error', message: 'reset' } });
    const { from } = members({ data: [{ id: 'm1' }], error: null });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it('fails closed when the member lookup errors', async () => {
    settings();
    members({ data: [{ id: 'm1' }], error: { message: 'boom' } });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });
});
