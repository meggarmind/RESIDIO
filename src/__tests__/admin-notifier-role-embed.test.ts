import { describe, it, expect, vi, beforeEach } from 'vitest';

// profiles has two FKs to app_roles (profiles_role_id_fkey, app_roles_created_by_fkey),
// so PostgREST rejects an unhinted `app_roles` embed with PGRST201 and returns no rows.
const inserted: unknown[] = [];

function profilesQuery() {
  let select = '';
  const q = {
    select(cols: string) { select = cols; return q; },
    in() {
      const ambiguous = /app_roles(?!!profiles_role_id_fkey)[!(]/.test(select);
      return Promise.resolve(
        ambiguous
          ? { data: null, error: { code: 'PGRST201', message: 'more than one relationship' } }
          : { data: [{ id: 'admin-1' }, { id: 'chair-1' }], error: null },
      );
    },
  };
  return q;
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from(table: string) {
      if (table === 'profiles') return profilesQuery();
      if (table === 'in_app_notifications') {
        return { insert: (rows: unknown[]) => { inserted.push(...rows); return Promise.resolve({ error: null }); } };
      }
      throw new Error(`unexpected table ${table}`);
    },
  })),
}));

import { notifyAdmins } from '@/lib/notifications/admin-notifier';

describe('notifyAdmins default recipients', () => {
  beforeEach(() => { inserted.length = 0; });

  it('notifies super_admin and chairman profiles when no permission is given', async () => {
    const result = await notifyAdmins({ title: 'T', body: 'B', category: 'system' });

    expect(result).toEqual({ success: true, count: 2 });
    expect(inserted.map((r) => (r as { recipient_id: string }).recipient_id)).toEqual(['admin-1', 'chair-1']);
  });
});
