// @vitest-environment jsdom
//
// #1373: which menu entries light up. Reports has three children that are tabs of one page, so they
// match on the ?tab= value; every other child still matches on the path.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Sidebar } from '@/components/dashboard/sidebar';
import { MobileNav } from '@/components/dashboard/mobile-nav';

let pathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
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

beforeEach(() => {
  pathname = '/dashboard';
});
afterEach(cleanup);

const query = (q: string) => new URLSearchParams(q);

// Sidebar: a child is active when its background is the accent colour; a parent when its row has bg-primary/10.
const sidebarChildActive = (name: string) => screen.getByRole('link', { name }).style.backgroundColor === 'var(--accent-primary)';
const sidebarParentActive = (name: string) =>
  Boolean(screen.getByRole('link', { name: new RegExp(`^${name}`) }).closest('div')?.className.includes('bg-primary/10'));

describe('Sidebar active state (#1373)', () => {
  it('lights only History on /reports?tab=recent', () => {
    pathname = '/reports';
    render(<Sidebar searchParams={query('tab=recent')} />);
    expect(sidebarChildActive('History')).toBe(true);
    expect(sidebarChildActive('New report')).toBe(false);
    expect(sidebarChildActive('Schedules')).toBe(false);
  });

  it('lights New report on bare /reports', () => {
    pathname = '/reports';
    render(<Sidebar searchParams={query('')} />);
    expect(sidebarChildActive('New report')).toBe(true);
    expect(sidebarChildActive('History')).toBe(false);
  });

  it('does not light Reports on /reports/financial-overview', () => {
    pathname = '/reports/financial-overview';
    render(<Sidebar searchParams={query('')} />);
    expect(sidebarParentActive('Reports')).toBe(false);
    expect(sidebarChildActive('New report')).toBe(false);
  });

  it('still lights Generate Invoices on /billing/generate', () => {
    pathname = '/billing/generate';
    render(<Sidebar searchParams={query('')} />);
    expect(sidebarChildActive('Generate Invoices')).toBe(true);
    expect(sidebarParentActive('Invoices & Dues')).toBe(true);
  });
});

const current = (name: string) => screen.getByRole('link', { name }).getAttribute('aria-current') === 'page';

describe('MobileNav active state (#1373)', () => {
  it('lights only History on /reports?tab=recent', () => {
    pathname = '/reports';
    render(<MobileNav open onOpenChange={() => {}} searchParams={query('tab=recent')} />);
    expect(current('History')).toBe(true);
    expect(current('New report')).toBe(false);
    expect(current('Schedules')).toBe(false);
  });

  it('lights New report on bare /reports', () => {
    pathname = '/reports';
    render(<MobileNav open onOpenChange={() => {}} searchParams={query('')} />);
    expect(current('New report')).toBe(true);
    expect(current('History')).toBe(false);
  });

  it('does not light Reports on /reports/financial-overview', () => {
    pathname = '/reports/financial-overview';
    render(<MobileNav open onOpenChange={() => {}} searchParams={query('')} />);
    expect(current('Reports')).toBe(false);
  });

  it('still lights Generate Invoices parent chain on /billing/generate', () => {
    pathname = '/billing/generate';
    render(<MobileNav open onOpenChange={() => {}} searchParams={query('')} />);
    expect(current('Generate Invoices')).toBe(true);
    expect(current('Invoices & Dues')).toBe(true);
  });
});
