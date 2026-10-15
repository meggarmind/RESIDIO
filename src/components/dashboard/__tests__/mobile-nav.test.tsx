// @vitest-environment jsdom
//
// Issue #102 criterion 2: the mobile menu must reach the same admin areas as
// the desktop sidebar, including nested children (Import Email and Financial
// Overview are linked from nowhere else). Uses the real shared navigation hook
// and config; only the permission source is mocked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MobileNav } from '@/components/dashboard/mobile-nav';

let pathname = '/dashboard';
let granted: 'all' | Set<string> = 'all';

vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    profile: { full_name: 'Test Admin', role_display_name: 'Admin' },
    isLoading: false,
    hasAnyPermission: (perms: string[]) =>
      granted === 'all' ? true : perms.some((p) => (granted as Set<string>).has(p)),
  }),
}));
vi.mock('@/contexts/visual-theme-context', () => ({ useVisualTheme: () => ({ themeId: 'default' }) }));
vi.mock('@/hooks/use-estate-logo', () => ({ useEstateLogo: () => ({ logoUrl: null }) }));
vi.mock('@/components/ui/theme-switcher', () => ({ ThemeSwitcher: () => null }));

const PERMS = {
  paymentsView: 'payments.view',
  importsCreate: 'imports.create',
  reportsFinancial: 'reports.view_financial',
};

beforeEach(() => {
  pathname = '/dashboard';
  granted = 'all';
});
afterEach(cleanup);

const link = (name: string) => screen.getByRole('link', { name });
const linksTo = (href: string) =>
  screen.getAllByRole('link').filter((a) => a.getAttribute('href') === href);

describe('MobileNav nested children (#102)', () => {
  it('renders the nested children desktop shows, for a user with the permissions', () => {
    render(<MobileNav open onOpenChange={() => {}} />);
    expect(link('Import Statement')).toHaveAttribute('href', '/payments/import');
    expect(link('Import Email')).toHaveAttribute('href', '/payments/email-imports');
    expect(link('Generate Invoices')).toHaveAttribute('href', '/billing/generate');
    expect(link('Financial Overview')).toHaveAttribute('href', '/reports/financial-overview');
  });

  it('omits a child the user lacks permission for while its parent is shown', () => {
    granted = new Set([PERMS.paymentsView, PERMS.importsCreate]);
    render(<MobileNav open onOpenChange={() => {}} />);
    expect(linksTo('/payments')).toHaveLength(1); // parent shown
    expect(screen.getByRole('link', { name: 'Import Statement' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Import Email' })).not.toBeInTheDocument();
  });

  it('does not render a child whose href equals its parent href as a duplicate row', () => {
    render(<MobileNav open onOpenChange={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Generate Reports' })).not.toBeInTheDocument();
    expect(linksTo('/reports')).toHaveLength(1);
  });

  it('gives nested links a 44px touch target and aria-current when active', () => {
    pathname = '/reports/financial-overview';
    render(<MobileNav open onOpenChange={() => {}} />);
    const active = link('Financial Overview');
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('min-h-[44px]');
    expect(active.className).toContain('focus-visible:ring-2');
    const inactive = link('Import Email');
    expect(inactive).not.toHaveAttribute('aria-current');
    expect(inactive.className).toContain('min-h-[44px]');
    // parent stays marked active as before
    expect(linksTo('/reports')[0]).toHaveAttribute('aria-current', 'page');
  });

  it('closes the sheet when a nested link is followed', () => {
    const onOpenChange = vi.fn();
    render(<MobileNav open onOpenChange={onOpenChange} />);
    fireEvent.click(link('Import Email'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
