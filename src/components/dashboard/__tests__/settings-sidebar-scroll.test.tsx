// @vitest-environment jsdom
//
// Issue #1012: the settings layout passed `hidden lg:block` to SettingsSidebar, and
// tailwind-merge dropped the sidebar's own `flex`, so the <aside> was a block box. Its
// nav box (`min-h-0 flex-1`) then grew to its content and never scrolled. jsdom has no
// layout, so this pins the merged classes that keep the aside a flex column. The box is
// native overflow: Radix ScrollArea's scrollbar did not appear after a group expanded.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

afterEach(cleanup);

describe('Settings sidebar scrolling (#1012)', () => {
  it('keeps the aside a flex column so the nav scroll area can shrink and scroll', () => {
    render(<SettingsLayout>page</SettingsLayout>);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveClass('hidden', 'lg:flex', 'flex-col');
    expect(aside).not.toHaveClass('lg:block');
    expect(screen.getByTestId('settings-nav-scroll')).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });

  it('indents System links that carry the Opens System arrow like their siblings', () => {
    render(<SettingsLayout>page</SettingsLayout>);
    fireEvent.click(screen.getByRole('button', { name: /System/i }));
    // The arrow is an svg child, and Button size sm's has-[>svg]:px-2.5 beat a plain pl-12.
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveClass('pl-12', 'has-[>svg]:pl-12');
  });
});
