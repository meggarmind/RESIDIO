import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { getResidentRollForwardBalance, setResidentRollForwardBalance } from '../balance-setting';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({
  PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage', WHATSAPP_VIEW: 'whatsapp.view' },
}));

const ROW_ID = '55555555-5555-4555-8555-555555555555'; // audit entity_id is a uuid (#594)

function client(old: unknown, saved: { data: unknown; error: unknown } = { data: { id: ROW_ID }, error: null }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const m of ['select', 'eq', 'upsert']) chain[m] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue({ data: old, error: null });
  chain.single = vi.fn().mockResolvedValue(saved);
  vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createAdminClient>);
  return chain;
}

describe('resident roll-forward balance setting (#863)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'admin-1', error: null } as never);
  });

  it('reads an absent row as off', async () => {
    client(null);
    await expect(getResidentRollForwardBalance()).resolves.toEqual({ success: true, data: false, error: null });
    expect(authorizePermission).toHaveBeenCalledWith('whatsapp.view');
  });

  it('saves the switch with whatsapp.manage and audits old and new values', async () => {
    const chain = client({ value: false });

    await expect(setResidentRollForwardBalance(true)).resolves.toEqual({ success: true, data: true, error: null });

    expect(authorizePermission).toHaveBeenCalledWith('whatsapp.manage');
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'balance_roll_forward_resident_enabled', value: true }), { onConflict: 'key' });
    expect(logAudit).toHaveBeenCalledWith({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: ROW_ID,
      entityDisplay: 'Resident roll-forward balance',
      oldValues: { value: false },
      newValues: { key: 'balance_roll_forward_resident_enabled', value: true },
    });
  });

  it('refuses without whatsapp.manage and writes nothing', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, userId: null, error: 'Forbidden' } as never);

    await expect(setResidentRollForwardBalance(true)).resolves.toEqual({ success: false, data: null, error: 'Forbidden' });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('reports a failed save and does not audit it', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    client({ value: false }, { data: null, error: { message: 'denied' } });

    await expect(setResidentRollForwardBalance(true)).resolves.toEqual({ success: false, data: null, error: 'Failed to update the resident balance setting' });
    expect(logAudit).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
