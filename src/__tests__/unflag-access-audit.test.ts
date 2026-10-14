/**
 * Issue #301 -- unflagAccess() cleared flagged/flag_reason with no audit entry.
 * It now records the prior flag state. The permission deliberately stays
 * SECURITY_VIEW_LOGS (owner decision on #301); this test pins that.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { unflagAccess } from '@/actions/security/access-logs';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient, logAudit, update, calls, state } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  update: vi.fn(),
  calls: [] as string[],
  state: {
    existing: null as unknown,
    fetchError: null as unknown,
    updated: null as unknown,
    updateError: null as unknown,
  },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function makeClient() {
  return {
    from: vi.fn(() => {
      let mode: 'select' | 'update' = 'select';
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.update = vi.fn((vals: unknown) => {
        mode = 'update';
        update(vals);
        return chain;
      });
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(async () => {
        if (mode === 'update') {
          calls.push('update');
          return { data: state.updated, error: state.updateError };
        }
        return { data: state.existing, error: state.fetchError };
      });
      return chain;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  state.existing = {
    id: 'log-1',
    flagged: true,
    flag_reason: 'Tailgating',
    contact: { full_name: 'Jane Visitor' },
  };
  state.fetchError = null;
  state.updated = { id: 'log-1', flagged: false, flag_reason: null };
  state.updateError = null;
  authorizePermission.mockResolvedValue({ authorized: true });
  logAudit.mockImplementation(async () => {
    calls.push('audit');
  });
  createServerSupabaseClient.mockResolvedValue(makeClient());
});

describe('unflagAccess audit (#301)', () => {
  it('returns error, no write and no audit when permission is denied', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Nope' });
    const res = await unflagAccess('log-1');
    expect(res).toEqual({ data: null, error: 'Nope' });
    expect(update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('audits the unflag with prior state on success', async () => {
    const res = await unflagAccess('log-1');
    expect(res.error).toBeNull();
    expect(update).toHaveBeenCalledWith({ flagged: false, flag_reason: null });
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith({
      action: 'UPDATE',
      entityType: 'access_logs',
      entityId: 'log-1',
      entityDisplay: 'Unflagged: Jane Visitor',
      oldValues: { flagged: true, flag_reason: 'Tailgating' },
      newValues: { flagged: false, flag_reason: null },
    });
  });

  it('falls back to Unknown when the contact is missing', async () => {
    state.existing = { id: 'log-1', flagged: true, flag_reason: 'x', contact: null };
    await unflagAccess('log-1');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityDisplay: 'Unflagged: Unknown' })
    );
  });

  it('does not audit when the update fails', async () => {
    state.updated = null;
    state.updateError = { message: 'boom' };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await unflagAccess('log-1');
    expect(res).toEqual({ data: null, error: 'Failed to unflag access' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('does not update or audit when the log is not found', async () => {
    state.existing = null;
    const res = await unflagAccess('missing');
    expect(res).toEqual({ data: null, error: 'Access log not found' });
    expect(update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('audits after the update, not before', async () => {
    await unflagAccess('log-1');
    expect(calls).toEqual(['update', 'audit']);
  });

  it('still authorizes with SECURITY_VIEW_LOGS (owner decision, #301)', async () => {
    await unflagAccess('log-1');
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SECURITY_VIEW_LOGS);
  });
});
