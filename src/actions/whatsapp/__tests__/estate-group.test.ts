import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { listWahaGroups } from '@/lib/whatsapp/providers/waha';
import { getEstateGroupSelection, listEstateGroups, saveEstateGroup } from '../estate-group';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ resolveWhatsAppConfig: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/whatsapp/providers/waha', () => ({ listWahaGroups: vi.fn() }));

const authorized = { authorized: true, userId: 'u1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const denied = { authorized: false, userId: 'u', role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };
const waha = { provider: 'waha' as const, apiKey: 'k', webhookSecret: 'w', baseUrl: 'https://waha.test', session: 'default', fromNumber: '+1' };

function fakeClient(current: unknown = '') {
  const upsert = vi.fn();
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = () => Promise.resolve({ data: { value: current }, error: null });
  builder.upsert = (...args: unknown[]) => (upsert(...args), builder);
  builder.single = () => Promise.resolve({ data: { id: 'setting-1' }, error: null });
  vi.mocked(createAdminClient).mockReturnValue({ from: () => builder } as never);
  return { upsert };
}

describe('estate group actions (#1325)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: waha });
  });

  it.each([
    ['read', () => getEstateGroupSelection()],
    ['list', () => listEstateGroups()],
    ['save', () => saveEstateGroup('1203@g.us')],
  ])('%s needs whatsapp.manage and does nothing without it', async (_name, run) => {
    vi.mocked(authorizePermission).mockResolvedValue(denied as never);
    const client = fakeClient();

    expect(await run()).toMatchObject({ success: false, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.WHATSAPP_MANAGE);
    expect(client.upsert).not.toHaveBeenCalled();
    expect(listWahaGroups).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('reads the saved group and whether WAHA is the active provider', async () => {
    fakeClient('1203@g.us');
    expect(await getEstateGroupSelection()).toMatchObject({ success: true, data: { wahaActive: true, groupId: '1203@g.us' } });

    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'ok', config: { ...waha, provider: 'chatmaid' } } as never);
    expect(await getEstateGroupSelection()).toMatchObject({ data: { wahaActive: false } });
  });

  it('lists the groups from WAHA, and refuses when WAHA is not the provider', async () => {
    vi.mocked(listWahaGroups).mockResolvedValue([{ id: '1203@g.us', name: 'Estate' }]);
    expect(await listEstateGroups()).toMatchObject({ success: true, data: [{ id: '1203@g.us', name: 'Estate' }] });

    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'absent' } as never);
    expect(await listEstateGroups()).toMatchObject({ success: false, error: expect.stringContaining('WAHA') });
  });

  it('saves the id, writes an audit row, and rejects ids that are not a group', async () => {
    const client = fakeClient('');

    expect(await saveEstateGroup('1203@g.us')).toEqual({ success: true, error: null });
    expect(client.upsert).toHaveBeenCalledWith(
      { key: 'whatsapp_estate_group_id', value: '1203@g.us', category: 'notifications' },
      { onConflict: 'key' }
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'system_settings', entityId: 'setting-1', newValues: { whatsapp_estate_group_id: '1203@g.us' } })
    );

    client.upsert.mockClear();
    expect(await saveEstateGroup('2348000000000@c.us')).toMatchObject({ success: false });
    expect(client.upsert).not.toHaveBeenCalled();
  });

  it('refuses to save a group when WAHA is not the provider, but lets an admin clear it', async () => {
    const client = fakeClient('1203@g.us');
    vi.mocked(resolveWhatsAppConfig).mockResolvedValue({ status: 'absent' } as never);

    expect(await saveEstateGroup('1203@g.us')).toMatchObject({ success: false });
    expect(client.upsert).not.toHaveBeenCalled();
    expect(await saveEstateGroup('')).toEqual({ success: true, error: null });
    expect(client.upsert).toHaveBeenCalledWith(expect.objectContaining({ value: '' }), { onConflict: 'key' });
  });
});
