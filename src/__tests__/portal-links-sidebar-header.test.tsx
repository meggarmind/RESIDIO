// @vitest-environment jsdom
//
// #423: the admin sidebar and header only render portal entry points when the
// AuthProvider says the user may see them. These tests drive the real Sidebar
// and Header with a mocked useAuth.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthValue = {
  profile: Record<string, unknown> | null;
  signOut: () => void;
  isSigningOut: boolean;
  isLoading: boolean;
  canSeeSelfPortalLinks: boolean;
  canSeeImpersonationLink: boolean;
  residentId: string | null;
  hasPermission: (permission: string) => boolean;
};

let authValue: AuthValue;

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => authValue,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/finance',
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/hooks/use-navigation', () => ({
  useSectionedNavigation: () => ({ sections: [] }),
}));
vi.mock('@/hooks/use-approvals', () => ({ usePendingApprovalsCount: () => ({ data: 0 }) }));
vi.mock('@/hooks/use-estate-logo', () => ({ useEstateLogo: () => ({ logoUrl: null }) }));
vi.mock('@/hooks/use-ops-status', () => ({ useOpsStatus: () => ({ maintenance: false, commsOverride: false }) }));
let sidebarState = { isCollapsed: false, isExpanded: true };
vi.mock('@/hooks/use-sidebar-state', () => ({
  useSidebarState: () => ({
    ...sidebarState,
    toggleCollapsed: vi.fn(),
    setHoverExpanded: vi.fn(),
  }),
}));
vi.mock('@/hooks/use-sidebar-nav-state', () => ({
  useSidebarNavState: () => ({ userToggled: {}, setMenuOpen: vi.fn() }),
}));
vi.mock('@/hooks/use-ai-assistant', () => ({
  useAiAssistant: () => ({ isDismissed: false, restoreAssistant: vi.fn() }),
}));
vi.mock('@/components/ui/theme-switcher', () => ({ ThemeSwitcher: () => null }));
vi.mock('@/components/notifications', () => ({ NotificationBell: () => null }));
vi.mock('@/components/dashboard/global-search-command', () => ({ GlobalSearchCommand: () => null }));
vi.mock('@/components/dashboard/admin-breadcrumb', () => ({ AdminBreadcrumb: () => null }));
// Render dropdown content inline so its items are visible without opening a portal.
vi.mock('@/components/ui/dropdown-menu', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    DropdownMenu: Pass,
    DropdownMenuContent: Pass,
    DropdownMenuItem: Pass,
    DropdownMenuLabel: Pass,
    DropdownMenuSeparator: () => null,
    DropdownMenuTrigger: Pass,
  };
});

// Tooltip content only mounts on hover; render it inline so the collapsed
// variant's labels are observable.
vi.mock('@/components/ui/tooltip', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Tooltip: Pass,
    TooltipProvider: Pass,
    TooltipTrigger: Pass,
    TooltipContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

const { Sidebar } = await import('@/components/dashboard/sidebar');
const { Header } = await import('@/components/dashboard/header');

function makeAuth(overrides: Partial<AuthValue> = {}): AuthValue {
  return {
    profile: {
      id: 'u1',
      full_name: 'Super Admin',
      email: 'admin@residio.test',
      role_name: 'super_admin',
      role_display_name: 'Super Administrator',
      permissions: [],
      resident_id: null,
    },
    signOut: vi.fn(),
    isSigningOut: false,
    isLoading: false,
    canSeeSelfPortalLinks: false,
    canSeeImpersonationLink: false,
    residentId: null,
    hasPermission: () => false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  sidebarState = { isCollapsed: false, isExpanded: true };
});

describe('Sidebar portal links (#423)', () => {
  it('hides My Portal and View as Resident when both booleans are false', () => {
    authValue = makeAuth();
    render(<Sidebar />);
    expect(screen.queryByText('My Portal')).toBeNull();
    expect(screen.queryByText('View as Resident')).toBeNull();
  });

  it('shows My Portal only when canSeeSelfPortalLinks is true', () => {
    authValue = makeAuth({ canSeeSelfPortalLinks: true });
    render(<Sidebar />);
    expect(screen.queryByText('My Portal')).not.toBeNull();
    expect(screen.queryByText('View as Resident')).toBeNull();
  });

  it('shows View as Resident only when canSeeImpersonationLink is true', () => {
    authValue = makeAuth({ canSeeImpersonationLink: true });
    render(<Sidebar />);
    expect(screen.queryByText('View as Resident')).not.toBeNull();
    expect(screen.queryByText('My Portal')).toBeNull();
  });
});

describe('Sidebar portal links, collapsed variant (#423)', () => {
  beforeEach(() => {
    sidebarState = { isCollapsed: true, isExpanded: false };
  });

  it('hides both entries when both booleans are false', () => {
    authValue = makeAuth();
    render(<Sidebar />);
    expect(screen.queryByText('My Portal')).toBeNull();
    expect(screen.queryByText('View as Resident')).toBeNull();
  });

  it('shows both entries when both booleans are true', () => {
    authValue = makeAuth({ canSeeSelfPortalLinks: true, canSeeImpersonationLink: true });
    render(<Sidebar />);
    expect(screen.queryByText('My Portal')).not.toBeNull();
    expect(screen.queryByText('View as Resident')).not.toBeNull();
    expect(document.querySelector('a[href="/portal"]')).not.toBeNull();
  });
});

describe('Sidebar gating source (#423)', () => {
  it('does not show My Portal from residentId alone', () => {
    authValue = makeAuth({ residentId: 'res-1', canSeeSelfPortalLinks: false });
    render(<Sidebar />);
    expect(screen.queryByText('My Portal')).toBeNull();
  });
});

describe('Header portal link (#423)', () => {
  it('does not show Resident Portal to a super_admin with no resident_id; shows the role label', () => {
    authValue = makeAuth({ canSeeSelfPortalLinks: false });
    render(<Header />);
    expect(screen.queryByText('Resident Portal')).toBeNull();
    expect(screen.queryByText('Super Administrator')).not.toBeNull();
  });

  it('shows Resident Portal when canSeeSelfPortalLinks is true', () => {
    authValue = makeAuth({ canSeeSelfPortalLinks: true });
    render(<Header />);
    expect(screen.queryByText('Resident Portal')).not.toBeNull();
  });
});

describe('Header two-factor link', () => {
  it('shows Two-factor login when the user has two_factor.enable', () => {
    authValue = makeAuth({ hasPermission: (p) => p === 'two_factor.enable' });
    render(<Header />);
    expect(screen.queryByText('Two-factor login')).not.toBeNull();
    expect(document.querySelector('a[href="/settings/two-factor"]')).not.toBeNull();
  });

  it('hides Two-factor login when the user lacks two_factor.enable', () => {
    authValue = makeAuth({ hasPermission: () => false });
    render(<Header />);
    expect(screen.queryByText('Two-factor login')).toBeNull();
    expect(document.querySelector('a[href="/settings/two-factor"]')).toBeNull();
  });
});
