// @vitest-environment jsdom
// Issue #1318: the Roles tab UI follows the server rules and shows load errors.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useState } from 'react';

const { mocks, mutation } = vi.hoisted(() => ({
  mocks: {
    profile: { role_name: 'treasurer', role_id: 'r-treasurer' } as { role_name: string; role_id: string } | null,
    roles: { data: undefined as unknown, isLoading: false, error: null as Error | null },
    permissions: { data: [] as unknown[], isLoading: false, error: null as Error | null },
    updatePermissions: { mutateAsync: vi.fn(), isPending: false },
  },
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    profile: mocks.profile,
    hasPermission: (p: string) => p === 'system.manage_roles',
  }),
}));
vi.mock('@/hooks/use-roles', () => ({
  useRolesWithPermissions: () => mocks.roles,
  usePermissions: () => mocks.permissions,
  useAdminTitles: () => ({ data: [], isLoading: false, error: null }),
  useCreateRoleWithPermissions: mutation,
  useUpdateRole: mutation,
  useDeleteRole: mutation,
  useUpdateRolePermissions: () => mocks.updatePermissions,
  useCreateAdminTitle: mutation,
  useUpdateAdminTitle: mutation,
  useDeleteAdminTitle: mutation,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { RolesList } from '@/components/admin/roles-list';
import { PermissionPicker } from '@/components/admin/permission-picker';
import { RolePermissionsDialog } from '@/components/admin/role-permissions-dialog';
import { RoleTitlesManager, parseSeats } from '@/components/admin/role-titles-manager';
import type { AppPermission, AppRoleWithPermissions } from '@/types/database';

const perm = (id: string, name: string, display_name: string): AppPermission =>
  ({ id, name, display_name, description: null, category: 'billing', is_active: true, created_at: '' }) as AppPermission;
const PERMS = [
  perm('p-view', 'billing.view', 'View invoices'),
  perm('p-edit', 'billing.edit', 'Edit invoices'),
  perm('p-void', 'billing.void', 'Void payments'),
];

const role = (id: string, name: string, extra: Partial<AppRoleWithPermissions> = {}) =>
  ({
    id,
    name,
    display_name: name[0].toUpperCase() + name.slice(1),
    description: null,
    category: 'exco',
    is_system_role: false,
    is_active: true,
    permissions: [],
    user_count: 0,
    ...extra,
  }) as AppRoleWithPermissions;

beforeEach(() => {
  mocks.profile = { role_name: 'treasurer', role_id: 'r-treasurer' };
  mocks.roles = { data: undefined, isLoading: false, error: null };
  mocks.permissions = { data: PERMS, isLoading: false, error: null };
});
afterEach(() => cleanup());

describe('RolesList (#1318)', () => {
  it('shows the load error with its reason, not "No roles yet"', () => {
    mocks.roles = { data: undefined, isLoading: false, error: new Error('permission denied') };
    render(<RolesList />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load roles: permission denied');
    expect(screen.queryByText('No roles yet')).not.toBeInTheDocument();
  });

  it('shows Edit, Manage access and Delete only where the server would allow them', () => {
    mocks.roles = {
      data: [
        role('r-ch', 'chairman', { is_system_role: true }),
        role('r-treasurer', 'treasurer'),
        role('r-auditor', 'auditor'),
      ],
      isLoading: false,
      error: null,
    };
    render(<RolesList />);

    for (const name of ['Chairman', 'Treasurer']) {
      expect(screen.queryAllByRole('button', { name: `Edit role ${name}` })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: `Delete role ${name}` })).toHaveLength(0);
      expect(screen.queryAllByRole('button', { name: `Manage access for ${name}` })).toHaveLength(0);
    }
    expect(screen.getAllByRole('button', { name: 'Edit role Auditor' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Delete role Auditor' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Manage access for Auditor' }).length).toBeGreaterThan(0);
  });
});

describe('PermissionPicker (#1318)', () => {
  function Harness({ initial }: { initial: string[] }) {
    const [value, setValue] = useState(new Set(initial));
    return (
      <>
        <PermissionPicker permissions={PERMS} value={value} onChange={setValue} />
        <output data-testid="value">{Array.from(value).sort().join(',')}</output>
      </>
    );
  }

  it('shows the load error with its reason', () => {
    render(<PermissionPicker permissions={undefined} error={new Error('boom')} value={new Set()} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load permissions: boom');
  });

  it('marks a partly granted module indeterminate', () => {
    render(<Harness initial={['p-view']} />);
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toHaveAttribute('data-state', 'indeterminate');
  });

  it('while searching, the module checkbox toggles only the visible permissions', () => {
    render(<Harness initial={[]} />);
    fireEvent.change(screen.getByPlaceholderText('Search modules and privileges...'), {
      target: { value: 'invoices' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Billing' }));
    expect(screen.getByTestId('value')).toHaveTextContent('p-edit,p-view');
  });
});

describe('RolePermissionsDialog (#1318)', () => {
  it('lists what Save will add and remove, and keeps the dialog open when the save fails', async () => {
    const onOpenChange = vi.fn();
    const failing = vi.fn().mockRejectedValue(new Error('nope'));
    mocks.updatePermissions = { mutateAsync: failing, isPending: false };

    render(
      <RolePermissionsDialog
        role={role('r-auditor', 'auditor', { permissions: [PERMS[0]] })}
        open
        onOpenChange={onOpenChange}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'View invoices' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Void payments' }));

    expect(screen.getByText(/Adding 1:/).parentElement).toHaveTextContent('Void payments');
    expect(screen.getByText(/Removing 1:/).parentElement).toHaveTextContent('View invoices');

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});

describe('RoleTitlesManager (#1318)', () => {
  it('lists inactive roles, marked inactive, so their titles can be edited', () => {
    mocks.roles = { data: [role('r-auditor', 'auditor', { is_active: false })], isLoading: false, error: null };
    render(<RoleTitlesManager />);
    expect(screen.getByText('Auditor')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add title to Auditor' })).toBeInTheDocument();
  });

  it('hides title controls on a role the caller may not change', () => {
    mocks.roles = { data: [role('r-ch', 'chairman', { is_system_role: true })], isLoading: false, error: null };
    render(<RoleTitlesManager />);
    expect(screen.queryByRole('button', { name: 'Add title to Chairman' })).not.toBeInTheDocument();
  });

  it('shows the load error with its reason', () => {
    mocks.roles = { data: undefined, isLoading: false, error: new Error('denied') };
    render(<RoleTitlesManager />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load titles: denied');
  });

  it.each([
    ['', { ok: true, seats: null }],
    ['1', { ok: true, seats: 1 }],
    [' 99 ', { ok: true, seats: 99 }],
    ['0', { ok: false }],
    ['100', { ok: false }],
    ['1.5', { ok: false }],
    ['1e1', { ok: false }],
    ['-2', { ok: false }],
    ['0x5', { ok: false }],
  ])('parseSeats(%j)', (raw, expected) => {
    expect(parseSeats(raw)).toEqual(expected);
  });
});
