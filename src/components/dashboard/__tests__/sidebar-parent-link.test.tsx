// @vitest-environment jsdom
//
// Issue #1180: in the expanded sidebar a row with sub-items must be a link to its
// own page plus a separate chevron toggle, not one toggle button.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Sidebar } from '@/components/dashboard/sidebar';

let pathname = '/dashboard';
let search = '';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));
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
    canSeeSelfPortalLinks: false,
    canSeeImpersonationLink: false,
    hasPermission: () => true,
    hasAnyPermission: () => true,
  }),
}));
vi.mock('@/contexts/visual-theme-context', () => ({ useVisualTheme: () => ({ themeId: 'default' }) }));
vi.mock('@/hooks/use-approvals', () => ({ usePendingApprovalsCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/use-estate-logo', () => ({ useEstateLogo: () => ({ logoUrl: null }) }));
vi.mock('@/hooks/use-ops-status', () => ({
  useOpsStatus: () => ({ maintenance: false, commsOverride: false }),
}));
vi.mock('@/components/ui/theme-switcher', () => ({ ThemeSwitcher: () => null }));

afterEach(() => {
  cleanup();
  pathname = '/dashboard';
  search = '';
});

describe('Sidebar parent with sub-items (#1180)', () => {
  it('links the label to its href and toggles the sub-list from a separate chevron', () => {
    render(<Sidebar />);
    const link = screen.getByRole('link', { name: /Invoices & Dues/ });
    expect(link).toHaveAttribute('href', '/billing');

    const toggle = screen.getByRole('button', { name: 'Show Invoices & Dues pages' });
    expect(link).not.toContainElement(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('links Transactions to /payments', () => {
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /Transactions/ })).toHaveAttribute('href', '/payments');
  });
});

describe('Sidebar Reports tab links (#1373)', () => {
  it('opens the Reports sub-list on /reports and highlights only the open tab', () => {
    pathname = '/reports';
    search = 'tab=schedules';
    render(<Sidebar />);
    expect(screen.getByRole('button', { name: 'Show Reports pages' })).toHaveAttribute('aria-expanded', 'true');
    const style = (name: string) => screen.getByRole('link', { name }).getAttribute('style') ?? '';
    expect(style('Schedules')).toContain('var(--accent-primary)');
    expect(style('New report')).not.toContain('var(--accent-primary)');
    expect(style('History')).not.toContain('var(--accent-primary)');
  });
});
