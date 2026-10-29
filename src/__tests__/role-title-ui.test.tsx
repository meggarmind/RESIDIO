// @vitest-environment jsdom
// Issue #827: the title picker, the resident-link block and the per-row Change role / Remove role buttons.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { perms } = vi.hoisted(() => ({ perms: { held: [] as string[] } }));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => perms.held.includes(p) }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/actions/roles/assign-role', () => ({ assignRoleToProfile: vi.fn(), removeRoleFromProfile: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const ROLES = [
  { id: 'r-ch', name: 'chairman', display_name: 'Chairman', is_active: true, requires_resident: true, permissions: [] },
  { id: 'r-sec', name: 'secretary', display_name: 'Secretary', is_active: true, requires_resident: false, permissions: [] },
  { id: 'r-off', name: 'retired', display_name: 'Retired', is_active: false, requires_resident: false, permissions: [] },
  { id: 'r-tr', name: 'trustee', display_name: 'Trustee', is_active: true, requires_resident: true, permissions: [] },
];
vi.mock('@/hooks/use-roles', () => ({
  useAssignableRoles: () => ({ data: ROLES, isLoading: false, error: null }),
  useAdminTitles: () => ({ data: [] }),
}));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { AdminRoleActions } from '@/components/admin/admin-role-actions';
import {
  RoleTitlePicker,
  grantableRoles,
  isTitleFull,
  residentRoleBlock,
} from '@/components/admin/role-title-picker';
import type { AdminTitleWithHolders, AppRoleWithPermissions } from '@/types/database';

const ASSIGN = PERMISSIONS.SYSTEM_ASSIGN_ROLES;
const BOARD = PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES;

const title = (over: Partial<AdminTitleWithHolders>): AdminTitleWithHolders => ({
  id: 't1', role_id: 'r-ch', name: 'Vice Chairman', is_principal: false, seats: 1, sort_order: 1, holders: [], ...over,
});

const admin = (over: Record<string, unknown> = {}) => ({
  id: 'x', profile_id: 'p1', first_name: 'Jane', last_name: 'Doe', email: null, house_address: null,
  resident_id: 'res-1', role_id: 'r-sec', role_name: 'secretary', role_display_name: 'Secretary',
  title_id: null, title_name: null, ...over,
});

afterEach(() => cleanup());

describe('seat helpers', () => {
  it('a title is full once other holders fill its seats, and the person\'s own seat does not count', () => {
    const held = title({ holders: [{ profile_id: 'sam', name: 'Sam' }] });

    expect(isTitleFull(held, 'jane')).toBe(true);
    expect(isTitleFull(held, 'sam')).toBe(false);
    expect(isTitleFull(title({ seats: null, holders: [{ profile_id: 'sam', name: 'Sam' }] }), 'jane')).toBe(false);
    expect(isTitleFull(title({ seats: 2, holders: [{ profile_id: 'sam', name: 'Sam' }] }), 'jane')).toBe(false);
  });
});

describe('residentRoleBlock', () => {
  const chairman = ROLES[0] as unknown as AppRoleWithPermissions;
  const secretary = ROLES[1] as unknown as AppRoleWithPermissions;

  it('explains why a resident-only role cannot go to an account with no resident record', () => {
    expect(residentRoleBlock(chairman, false)).toContain('can only be held by a resident');
    expect(residentRoleBlock(chairman, true)).toBeNull();
    expect(residentRoleBlock(secretary, false)).toBeNull();
    expect(residentRoleBlock(undefined, false)).toBeNull();
  });

  it('renders the reason as an alert before anything is submitted', () => {
    render(
      <RoleTitlePicker role={chairman} titles={[]} titleId="" onTitleChange={vi.fn()} profileId="p1" hasResidentLink={false} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Chairman role can only be held by a resident');
  });
});

describe('grantableRoles mirrors the server grant guard', () => {
  const names = (held: string[]) => {
    perms.held = held;
    return grantableRoles(ROLES as unknown as AppRoleWithPermissions[], (p) => perms.held.includes(p)).map((r) => r.name);
  };

  it('offers board roles only with system.assign_board_roles, and never an inactive role', () => {
    expect(names([ASSIGN])).toEqual(['secretary']);
    expect(names([ASSIGN, BOARD])).toEqual(['chairman', 'secretary', 'trustee']);
  });
});

describe('Change role / Remove role on an administrator row', () => {
  it('shows both to an assign_roles holder on an ordinary account', () => {
    perms.held = [ASSIGN];
    render(<AdminRoleActions admin={admin()} />);

    expect(screen.getByRole('button', { name: /change role for jane doe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove role from jane doe/i })).toBeInTheDocument();
  });

  it('shows nothing without system.assign_roles', () => {
    perms.held = [];
    const { container } = render(<AdminRoleActions admin={admin()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides both on a chairman account unless the caller holds system.assign_board_roles', () => {
    perms.held = [ASSIGN];
    const chairman = admin({ role_id: 'r-ch', role_name: 'chairman', role_display_name: 'Chairman' });
    const { container, unmount } = render(<AdminRoleActions admin={chairman} />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    perms.held = [ASSIGN, BOARD];
    render(<AdminRoleActions admin={chairman} />);
    expect(screen.getByRole('button', { name: /change role for jane doe/i })).toBeInTheDocument();
  });

  it('never offers Remove role on a super administrator', () => {
    perms.held = [ASSIGN, BOARD];
    render(<AdminRoleActions admin={admin({ role_name: 'super_admin', role_display_name: 'Super Admin' })} />);

    expect(screen.getByRole('button', { name: /change role/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove role/i })).not.toBeInTheDocument();
  });
});
