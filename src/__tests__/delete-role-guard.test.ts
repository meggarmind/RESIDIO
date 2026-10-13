import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #455: deleteRole's "users still assigned" guard counts profiles through the user
 * client. It must name a granted column (not `*`) and must fail closed when the
 * count cannot be established, instead of treating an error as "no users".
 */

const state = vi.hoisted(() => ({
  countResult: { count: 0 as number | null, error: null as { message: string } | null },
  selectArgs: [] as unknown[][],
  deleted: false,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => ({}),
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: (...args: unknown[]) => {
          if (table === 'profiles') state.selectArgs.push(args);
          return b;
        },
        eq: () => b,
        delete: () => {
          if (table === 'app_roles') state.deleted = true;
          return b;
        },
        single: async () => ({ data: { id: 'r1', is_system_role: false, display_name: 'Role' }, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(table === 'profiles' ? state.countResult : { error: null }).then(resolve),
      };
      return b;
    },
  }),
}));

const { deleteRole } = await import('@/actions/roles');

beforeEach(() => {
  state.countResult = { count: 0, error: null };
  state.selectArgs = [];
  state.deleted = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('deleteRole assigned-users guard', () => {
  it('counts on an explicit column, never *', async () => {
    await deleteRole('r1');
    expect(state.selectArgs).toHaveLength(1);
    expect(state.selectArgs[0][0]).toBe('id');
  });

  it('refuses when users are assigned', async () => {
    state.countResult = { count: 3, error: null };
    const result = await deleteRole('r1');
    expect(result.success).toBe(false);
    expect(state.deleted).toBe(false);
  });

  it('fails closed when the count query errors', async () => {
    state.countResult = { count: null, error: { message: 'permission denied for table profiles' } };
    const result = await deleteRole('r1');
    expect(result.success).toBe(false);
    expect(state.deleted).toBe(false);
  });

  it('fails closed when the count is null without an error', async () => {
    state.countResult = { count: null, error: null };
    expect((await deleteRole('r1')).success).toBe(false);
    expect(state.deleted).toBe(false);
  });

  it('deletes when the role verifiably has no users', async () => {
    expect((await deleteRole('r1')).success).toBe(true);
    expect(state.deleted).toBe(true);
  });
});
