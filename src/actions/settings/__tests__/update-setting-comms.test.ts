import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ from: mocks.from, auth: { getUser: mocks.getUser } }),
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: mocks.authorizePermission,
  authorizeAnyPermission: mocks.authorizePermission,
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { updateSetting, updateSettings } from '@/actions/settings/update-setting';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
});

describe('the generic settings writers guard the comms settings', () => {
  it('updateSetting rejects a far-future Debug Mode expiry without touching the database', async () => {
    const result = await updateSetting('comms_debug_expires_at', '9999-12-31T00:00:00Z');
    expect(result.error).toMatch(/cannot be more than 480 minutes/);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('updateSetting rejects an invalid override phone without touching the database', async () => {
    const result = await updateSetting('comms_override_phone', '08012345678');
    expect(result.error).toMatch(/international format/);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('updateSettings (bulk) rejects the same values before writing anything', async () => {
    const result = await updateSettings({ comms_debug_mode: true, comms_debug_expires_at: 'never' });
    expect(result.success).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
