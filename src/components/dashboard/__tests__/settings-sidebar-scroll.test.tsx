// @vitest-environment jsdom
//
// Issue #1012: the settings layout passed `hidden lg:block` to SettingsSidebar, and
// tailwind-merge dropped the sidebar's own `flex`, so the <aside> was a block box. Its
// ScrollArea (`min-h-0 flex-1`) then grew to its content and never scrolled. jsdom has no
// layout, so this pins the merged classes that keep the aside a flex column.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/billing',
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
  useAuth: () => ({ isLoading: false, hasAnyPermission: () => true }),
}));
vi.mock('@/components/dashboard/settings/settings-mobile-nav', () => ({ SettingsMobileNav: () => null }));
vi.mock('@/components/ui/page-transition', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SettingsLayout from '@/app/(dashboard)/settings/layout';

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});
afterEach(cleanup);

describe('Settings sidebar scrolling (#1012)', () => {
  it('keeps the aside a flex column so the nav scroll area can shrink and scroll', () => {
    render(<SettingsLayout>page</SettingsLayout>);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveClass('hidden', 'lg:flex', 'flex-col');
    expect(aside).not.toHaveClass('lg:block');
    expect(aside.querySelector('[data-slot="scroll-area"]')).toHaveClass('min-h-0', 'flex-1');
  });
});
