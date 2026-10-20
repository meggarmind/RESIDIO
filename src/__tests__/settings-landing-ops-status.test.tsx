// @vitest-environment jsdom
//
// #789: the Settings landing page marks the Maintenance and Communications
// override cards ON while those states are on, from the same cookie the
// dashboard banner reads.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

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
vi.mock('@/hooks/use-notifications', () => ({
  useNotificationTemplates: () => ({ data: [] }),
  useNotificationSchedules: () => ({ data: [] }),
}));

import SettingsPage from '@/app/(dashboard)/settings/page';

const card = (href: string) => screen.getAllByRole('link').find((a) => a.getAttribute('href') === href)!;

afterEach(() => {
  cleanup();
  document.cookie = 'residio_ops_status=; max-age=0; path=/';
});

describe('Settings landing ops status (#789)', () => {
  it('marks each card ON only while its own state is on', () => {
    document.cookie = 'residio_ops_status=10; path=/';
    render(<SettingsPage />);
    expect(card('/settings/maintenance')).toHaveTextContent('ON');
    expect(card('/settings/comms-override')).not.toHaveTextContent('ON');
    expect(card('/settings/data-retention')).not.toHaveTextContent('ON');
  });

  it('marks the override card when the override is on', () => {
    document.cookie = 'residio_ops_status=01; path=/';
    render(<SettingsPage />);
    expect(card('/settings/comms-override')).toHaveTextContent('ON');
    expect(card('/settings/maintenance')).not.toHaveTextContent('ON');
  });
});
