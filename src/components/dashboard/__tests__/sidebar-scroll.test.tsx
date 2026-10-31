// @vitest-environment jsdom
//
// Issue #1009: DashboardShell is one viewport tall (h-dvh) and the sidebar
// <aside> clips its overflow, so the nav must be allowed to shrink (min-h-0)
// and scroll (overflow-y-auto). Without both, menu items below the viewport
// and the sidebar footer cannot be reached. jsdom has no layout, so this pins
// the classes that make the nav the scroll container.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Sidebar } from '@/components/dashboard/sidebar';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

afterEach(cleanup);

describe('Sidebar nav scrolling (#1009)', () => {
  it('makes the nav a shrinkable scroll container inside the clipped aside', () => {
    render(<Sidebar />);
    const nav = screen.getByRole('navigation');
    expect(nav.closest('aside')).toHaveClass('overflow-hidden');
    expect(nav).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });
});
