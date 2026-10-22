// @vitest-environment jsdom
/**
 * #1014: the Current Administrators list keeps one row shape. On a wide container the rows
 * line up as columns under one header, which names the resident portal control and states
 * the estate default once instead of on every row.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const admins = [
  {
    profile_id: 'p1',
    first_name: 'Feyijimi',
    last_name: 'Adewole',
    email: null,
    house_address: '18A, Kayode Oni Animashaun',
    role_name: 'chairman',
    role_display_name: 'Chairman',
    title_name: null,
  },
  {
    profile_id: 'p2',
    first_name: 'Test',
    last_name: 'Treasurer',
    email: 'finance@residio.test',
    house_address: null,
    role_name: 'financial_officer',
    role_display_name: 'Financial Officer',
    title_name: 'Treasurer',
  },
];

vi.mock('@/hooks/use-roles', () => ({ useCurrentAdmins: () => ({ data: admins, isLoading: false, error: null }) }));
vi.mock('@/hooks/use-portal-access', () => ({ usePortalAccessOverrides: () => ({ data: {} }) }));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ residentPortalEnabled: false }) }));
vi.mock('@/components/admin/admin-role-actions', () => ({ AdminRoleActions: () => <button>Change role</button> }));
vi.mock('@/components/admin/portal-access-control', () => ({
  PortalAccessControl: ({ labelClassName, effectiveClassName }: { labelClassName?: string; effectiveClassName?: string }) => (
    <div data-testid="portal" data-label={labelClassName} data-effective={effectiveClassName} />
  ),
}));

const { CurrentAdminsList } = await import('@/components/admin/current-admins-list');

afterEach(cleanup);

describe('CurrentAdminsList layout (#1014)', () => {
  it('uses the same column template for the header and every row', () => {
    const { container } = render(<CurrentAdminsList />);
    const header = container.querySelector('[aria-hidden="true"]')!;
    const rows = screen.getAllByTestId('current-admin-row');
    const columns = (el: Element) => el.className.split(' ').find((c) => c.startsWith('@4xl:grid-cols-'));

    expect(columns(header)).toBeDefined();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(columns(row)).toBe(columns(header));
  });

  it('states the estate default once in the header and hides the per-row label in columns', () => {
    render(<CurrentAdminsList />);
    expect(screen.getByText('Estate default: off')).toBeInTheDocument();
    for (const portal of screen.getAllByTestId('portal')) {
      expect(portal.dataset.label).toContain('@4xl:hidden');
      expect(portal.dataset.effective).toContain('@4xl:hidden');
    }
  });

  it('truncates long names and addresses instead of wrapping them', () => {
    render(<CurrentAdminsList />);
    const row = screen.getAllByTestId('current-admin-row')[0];
    expect(within(row).getByText('Feyijimi Adewole')).toHaveClass('truncate');
    expect(within(row).getByText('18A, Kayode Oni Animashaun')).toHaveClass('truncate');
    expect(row).not.toHaveClass('hover:bg-muted/50');
  });
});
