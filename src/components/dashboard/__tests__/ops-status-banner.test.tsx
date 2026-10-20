// @vitest-environment jsdom
//
// #789: a persistent banner while maintenance mode or the communications
// override is on, shown only to holders of the matching settings permission.
// The state comes from the cookie the middleware sets, so these tests set it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OpsStatusBanner } from '@/components/dashboard/ops-status-banner';
import { PERMISSIONS } from '@/lib/auth/action-roles';

let granted = new Set<string>();

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => granted.has(p) }),
}));

const MAINTENANCE = 'Maintenance mode is ON. Non-admin users are locked out.';
const OVERRIDE = 'Communications override is ON. Messages go to override contacts, not residents.';

const setCookie = (value: string) => {
  document.cookie = `residio_ops_status=${value}; path=/`;
};
const banner = (text: string) => screen.queryByText(text, { exact: false });
const linkIn = (text: string) => banner(text)?.closest('span')?.querySelector('a');

beforeEach(() => {
  granted = new Set([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE, PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
});
afterEach(() => {
  cleanup();
  document.cookie = 'residio_ops_status=; max-age=0; path=/';
});

describe('OpsStatusBanner (#789)', () => {
  it('shows only the maintenance notice, linking to its settings page', () => {
    setCookie('10');
    render(<OpsStatusBanner />);
    expect(banner(MAINTENANCE)).toBeInTheDocument();
    expect(banner(OVERRIDE)).not.toBeInTheDocument();
    expect(linkIn(MAINTENANCE)).toHaveAttribute('href', '/settings/maintenance');
  });

  it('shows only the override notice, linking to its settings page', () => {
    setCookie('01');
    render(<OpsStatusBanner />);
    expect(banner(OVERRIDE)).toBeInTheDocument();
    expect(banner(MAINTENANCE)).not.toBeInTheDocument();
    expect(linkIn(OVERRIDE)).toHaveAttribute('href', '/settings/comms-override');
  });

  it('shows both notices when both states are on', () => {
    setCookie('11');
    render(<OpsStatusBanner />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });

  it('renders nothing when both states are off', () => {
    setCookie('00');
    const { container } = render(<OpsStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing without the cookie or with a malformed one', () => {
    const { container, rerender } = render(<OpsStatusBanner />);
    expect(container).toBeEmptyDOMElement();
    setCookie('maybe');
    rerender(<OpsStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('hides each notice from an admin without the matching permission', () => {
    setCookie('11');
    granted = new Set([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    render(<OpsStatusBanner />);
    expect(banner(MAINTENANCE)).not.toBeInTheDocument();
    expect(banner(OVERRIDE)).toBeInTheDocument();

    cleanup();
    granted = new Set([PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE]);
    render(<OpsStatusBanner />);
    expect(banner(MAINTENANCE)).toBeInTheDocument();
    expect(banner(OVERRIDE)).not.toBeInTheDocument();
  });

  it('has no dismiss control', () => {
    setCookie('11');
    render(<OpsStatusBanner />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
