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
    // A fixed width, not lg:w-1/5: at 1411px that was 199px and clipped "WhatsApp admin access".
    expect(aside).toHaveClass('lg:w-56', 'xl:w-64', 'lg:shrink-0');
    expect(aside).not.toHaveClass('lg:w-1/5');
    expect(screen.getByTestId('settings-nav-scroll')).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
  });

  it('indents System links that carry the Opens System arrow like their siblings', () => {
    render(<SettingsLayout>page</SettingsLayout>);
    fireEvent.click(screen.getByRole('button', { name: /System/i }));
    // The arrow is an svg child, and Button size sm's has-[>svg]:px-2.5 beat a plain pl-12.
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveClass('pl-12', 'has-[>svg]:pl-12');
    // A title too long for the column wraps rather than being clipped.
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveClass('whitespace-normal', 'h-auto');
  });

  it('fits the aside to the visible part of <main> and refits on scroll, capped at the row foot', () => {
    const rect = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    const tops = { aside: 300 };
    let rowBottom = 5000;
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'MAIN') return rect(0, 900);
      if (this.tagName === 'ASIDE') return rect(tops.aside, 0);
      return rect(0, rowBottom);
    });
    const { container } = render(<main style={{ paddingBottom: '20px' }}><SettingsLayout>page</SettingsLayout></main>);
    const main = container.querySelector('main')!;
    const aside = screen.getByRole('complementary');
    expect(aside.style.height).toBe('580px'); // 900 - 20 padding - 300 top

    tops.aside = 100;
    fireEvent.scroll(main);
    expect(aside.style.height).toBe('780px');

    rowBottom = 700; // the row ends above the fold: stop there, or sticky pushes the aside up
    fireEvent.scroll(main);
    expect(aside.style.height).toBe('600px');
    spy.mockRestore();
  });
});
