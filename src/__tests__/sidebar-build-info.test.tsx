// @vitest-environment jsdom
//
// Build identity in the admin sidebar footer (#421). Mocks mirror portal-links-sidebar-header.test.tsx.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

type AuthValue = {
  profile: Record<string, unknown> | null;
  signOut: () => void;
  isSigningOut: boolean;
  isLoading: boolean;
  canSeeSelfPortalLinks: boolean;
  canSeeImpersonationLink: boolean;
  residentId: string | null;
};

let authValue: AuthValue;

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => authValue,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/finance',
  useSearchParams: () => new URLSearchParams(),
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

const auth: AuthValue = {
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
};

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  sidebarState = { isCollapsed: false, isExpanded: true };
});

const stubStaging = () => {
  vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'v0.5.0');
  vi.stubEnv('NEXT_PUBLIC_GIT_SHA', 'a1b2c3d4e5f6');
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
};

describe('Sidebar build info (#421)', () => {
  it('shows the version string and a STAGE badge on staging', () => {
    authValue = auth;
    stubStaging();
    render(<Sidebar />);
    expect(screen.queryByText('v0.5.0 · a1b2c3d')).not.toBeNull();
    expect(screen.queryByText('STAGE')).not.toBeNull();
  });

  it('shows no badge on production but still shows the version', () => {
    authValue = auth;
    stubStaging();
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    render(<Sidebar />);
    expect(screen.queryByText('v0.5.0 · a1b2c3d')).not.toBeNull();
    expect(screen.queryByText('STAGE')).toBeNull();
    expect(screen.queryByText('DEV')).toBeNull();
  });

  it('shows tag patch + commits as -dev past a release, with the full version in the tooltip (#633)', () => {
    authValue = auth;
    stubStaging();
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', 'v0.5.0-341-ga1b2c3d');
    render(<Sidebar />);
    // Focusable, so keyboard users can open the tooltip carrying the full version.
    expect(screen.getByText('v0.5.341-dev').getAttribute('tabindex')).toBe('0');
    expect(screen.queryByText('v0.5.0-341-ga1b2c3d')).not.toBeNull();
    expect(screen.queryByText(/· a1b2c3d/)).toBeNull();
  });

  it('shows dev / unknown with a DEV badge when nothing is set', () => {
    authValue = auth;
    vi.stubEnv('NEXT_PUBLIC_APP_VERSION', '');
    vi.stubEnv('NEXT_PUBLIC_GIT_SHA', '');
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', '');
    render(<Sidebar />);
    expect(screen.queryByText('dev')).not.toBeNull();
    expect(screen.queryByText('dev · unknown')).not.toBeNull();
    expect(screen.queryByText('DEV')).not.toBeNull();
  });

  it('collapsed: badge plus full string in the tooltip on staging, nothing on production', () => {
    authValue = auth;
    sidebarState = { isCollapsed: true, isExpanded: false };
    stubStaging();
    render(<Sidebar />);
    expect(screen.queryByText('STAGE')).not.toBeNull();
    expect(screen.queryByText('v0.5.0 · a1b2c3d')).not.toBeNull();
    cleanup();
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
    render(<Sidebar />);
    expect(screen.queryByTestId('build-info')).toBeNull();
  });
});

