import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1063: the admin a session records can no longer UPDATE impersonation_sessions
 * directly. Ending a session and logging a page view must go through the two
 * narrow database functions, never a table .update().
 */

const h = vi.hoisted(() => ({
  rpc: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      single: async () => ({
        data: {
          id: 'sess-1',
          admin_profile_id: 'admin-1',
          is_active: true,
          impersonated_resident_id: 'res-1',
          residents: { first_name: 'Ada', last_name: 'Obi' },
        },
        error: null,
      }),
      update: (...args: unknown[]) => {
        h.update(...args);
        return chain;
      },
    };
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) },
      from: () => chain,
      rpc: h.rpc,
    };
  },
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));

import { endImpersonationSession, logImpersonationPageView } from '@/actions/impersonation';

beforeEach(() => {
  h.rpc.mockReset();
  h.update.mockReset();
});

describe('impersonation session writes', () => {
  it('ends a session through end_impersonation_session', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null });
    expect(await endImpersonationSession('sess-1')).toEqual({ success: true });
    expect(h.rpc).toHaveBeenCalledWith('end_impersonation_session', { p_session_id: 'sess-1' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('reports a session the function did not end', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect((await endImpersonationSession('sess-1')).success).toBe(false);
  });

  it('logs a page view through log_impersonation_page_view', async () => {
    h.rpc.mockResolvedValue({ data: true, error: null });
    expect(await logImpersonationPageView('sess-1', '/portal')).toEqual({ success: true });
    expect(h.rpc).toHaveBeenCalledWith('log_impersonation_page_view', { p_session_id: 'sess-1', p_path: '/portal' });
    expect(h.update).not.toHaveBeenCalled();
  });

  it('reports a page view on no active session', async () => {
    h.rpc.mockResolvedValue({ data: false, error: null });
    expect(await logImpersonationPageView('sess-1', '/portal')).toEqual({ success: false, error: 'Active session not found' });
  });
});
