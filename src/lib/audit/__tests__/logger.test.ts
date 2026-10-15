import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const insert = vi.fn();
const from = vi.fn(() => ({ insert }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { getUser } })),
  createAdminClient: vi.fn(() => ({ from })),
}));

import { logAudit } from '@/lib/audit/logger';

describe('logAudit', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('inserts one audit_logs row with the legacy shape and resolves the user exactly once', async () => {
    await logAudit({
      action: 'UPDATE',
      entityType: 'houses',
      entityId: 'house-1',
      entityDisplay: '12A',
      oldValues: { a: 1, b: 9 },
      newValues: { a: 2, b: 9 },
      description: 'changed',
      metadata: { k: 'v' },
    });

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('audit_logs');
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith({
      actor_id: 'user-1',
      action: 'UPDATE',
      entity_type: 'houses',
      entity_id: 'house-1',
      entity_display: '12A',
      old_values: { a: 1, b: 9 },
      new_values: { a: 2, b: 9 },
      description: 'changed',
      metadata: { k: 'v' },
      ip_address: null,
      user_agent: null,
    });
  });

  it('writes nothing and logs when there is no session', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await logAudit({ action: 'CREATE', entityType: 'houses', entityId: 'h' });

    expect(insert).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith('[Audit] Cannot log audit: No authenticated user');
  });

  it('does not throw when the insert returns an error', async () => {
    insert.mockResolvedValue({ error: { message: 'denied' } });

    await expect(
      logAudit({ action: 'CREATE', entityType: 'houses', entityId: 'h' })
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Audit]'),
      expect.objectContaining({ entityType: 'houses', entityId: 'h', action: 'CREATE', error: 'denied' })
    );
    expect(String(errorSpy.mock.calls[0][0])).toMatch(/^\[Audit\]/);
  });

  it('does not throw when the insert throws', async () => {
    insert.mockRejectedValue(new Error('boom'));

    await expect(
      logAudit({ action: 'CREATE', entityType: 'houses', entityId: 'h' })
    ).resolves.toBeUndefined();
  });

  it('does not throw when resolving the session throws', async () => {
    getUser.mockRejectedValue(new Error('auth down'));

    await expect(
      logAudit({ action: 'CREATE', entityType: 'houses', entityId: 'h' })
    ).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
});
