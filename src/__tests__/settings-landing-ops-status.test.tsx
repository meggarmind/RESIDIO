// @vitest-environment jsdom
//
// #789: the Settings landing page marks the Maintenance and Communications
// override cards ON while those states are on, from the same cookie the
// dashboard banner reads.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('next/navigation', () => ({ usePathname: () => '/settings' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true, hasAnyPermission: () => true }),
}));
vi.mock('@/actions/settings/get-setup-status', () => ({
  getSetupStatus: async () => ({ data: null, error: null }),
}));

import SettingsPage from '@/app/(dashboard)/settings/page';

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>
  );

const card = (href: string) => screen.getAllByRole('link').find((a) => a.getAttribute('href') === href)!;

afterEach(() => {
  cleanup();
  document.cookie = 'residio_ops_status=; max-age=0; path=/';
});

describe('Settings landing ops status (#789)', () => {
  it('marks each card ON only while its own state is on', () => {
    document.cookie = 'residio_ops_status=10; path=/';
    renderPage();
    expect(card('/settings/system')).toHaveTextContent('ON');
    expect(card('/settings/sending')).not.toHaveTextContent('ON');
  });

  it('marks the override card when the override is on', () => {
    document.cookie = 'residio_ops_status=01; path=/';
    renderPage();
    expect(card('/settings/sending')).toHaveTextContent('ON');
    expect(card('/settings/system')).not.toHaveTextContent('ON');
  });
});
