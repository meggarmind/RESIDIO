import { describe, expect, it } from 'vitest';

import { PERMISSIONS, isAdminRole } from '@/lib/auth/action-roles';

/**
 * The role model of #825 (slice 3 of #822), as the app sees it. The seed migration itself cannot
 * run here (no database in unit tests); its VERIFY block and ROLLBACK probe check the seeded rows.
 */
describe('role model (#825)', () => {
  it('has the board-role permission constant', () => {
    expect(PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES).toBe('system.assign_board_roles');
  });

  it.each(['welfare_officer', 'trustee', 'security_guard_supervisor'])(
    'routes %s to the dashboard when the role join carries no category',
    (name) => {
      expect(isAdminRole({ name, category: null })).toBe(true);
    }
  );

  it.each(['vice_chairman', 'project_manager', 'resident'])(
    'no longer treats the retired %s role as a built-in admin role',
    (name) => {
      expect(isAdminRole({ name, category: null })).toBe(false);
    }
  );
});
