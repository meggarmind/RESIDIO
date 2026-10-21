// @vitest-environment jsdom
//
// #933: the Settings sub-sidebar and mobile sheet carry a setting-level search, the System
// group links to the /system monitoring pages marked "Opens System", and the mobile trigger
// names the current page.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { settingsConfig, settingsPageLabel } from '@/config/settings-nav';

const state = vi.hoisted(() => ({ pathname: '/settings/billing/late-fees', permissions: null as string[] | null }));
const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push }),
}));
// Give one page a section with a row, so row-level hits and their permission can be tested
// before any real page declares sections.
vi.mock('@/config/settings-nav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/settings-nav')>();
  const email = actual.flattenSettingsNav(actual.settingsConfig).find((item) => item.href === '/settings/groups')!;
  email.sections = [
    {
      id: 'testing',
      title: 'Testing',
      permissions: ['notifications.manage' as never],
      rows: [{ id: 'redirect-all', label: 'Redirect every message', keywords: ['penalty-free'] }],
    },
  ];
  return actual;
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasAnyPermission: (ps: string[]) => state.permissions === null || ps.some((p) => state.permissions!.includes(p)),
  }),
}));

import { SettingsSidebar } from '@/components/dashboard/settings/settings-sidebar';
import { SettingsMobileNav } from '@/components/dashboard/settings/settings-mobile-nav';

import * as search from '@/lib/search/settings-search-entries';

afterEach(() => {
  cleanup();
  state.pathname = '/settings/billing/late-fees';
  state.permissions = null;
  push.mockClear();
});

const type = (value: string) =>
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value } });

describe('Monitoring entry in the System group', () => {
  const system = settingsConfig.find((g) => g.title === 'System')!;
  const monitoring = system.items.find((i) => i.title === 'Monitoring')!;

  it('links to the four /system pages, each marked as opening System', () => {
    expect(monitoring.children!.map((c) => c.href)).toEqual([
      '/system/audit-logs',
      '/system/cron-status',
      '/system/notification-queue',
      '/system/notification-history',
    ]);
    expect(monitoring.children!.every((c) => c.opensSystem)).toBe(true);
  });

  it('asks each child for exactly the permission its /system route needs', () => {
    expect(monitoring.children!.map((c) => c.permissions)).toEqual([
      [PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS],
      [PERMISSIONS.SYSTEM_MONITOR],
      [PERMISSIONS.NOTIFICATIONS_MANAGE],
      [PERMISSIONS.NOTIFICATIONS_MANAGE],
    ]);
  });

  it('renders the mark in the sidebar', () => {
    state.pathname = '/settings/maintenance';
    render(<SettingsSidebar />);
    const link = screen.getByRole('link', { name: /Audit Logs/ });
    expect(link).toHaveAttribute('href', '/system/audit-logs');
    expect(within(link).getByText('(opens System)')).toBeInTheDocument();
    expect(screen.getByText('Opens System')).toBeInTheDocument();
  });
});

describe('matchVisibleSettingsEntries', () => {
  const all = () => true;

  it('finds a /system monitoring page and flags it', () => {
    const hit = search.matchVisibleSettingsEntries(settingsConfig, 'audit', all).find((e) => e.href === '/system/audit-logs');
    expect(hit?.opensSystem).toBe(true);
    expect(hit?.type).toBe('system');
  });

  it('never returns a page the nav does not link to', () => {
    const noMonitoring = settingsConfig.map((g) => ({ ...g, items: g.items.filter((i) => i.title !== 'Monitoring') }));
    expect(search.matchVisibleSettingsEntries(noMonitoring, 'audit', all).map((e) => e.href)).not.toContain('/system/audit-logs');
  });

  it('finds a row by its keyword and links to the row and section', () => {
    const [hit] = search.matchVisibleSettingsEntries(settingsConfig, 'penalty-free', all);
    expect(hit.href).toBe('/settings/groups?row=redirect-all#testing');
  });

  it('hides a row whose section permission the reader lacks, but keeps its page', () => {
    const canSee = (ps: string[]) => !ps.includes(PERMISSIONS.NOTIFICATIONS_MANAGE);
    expect(search.matchVisibleSettingsEntries(settingsConfig, 'penalty-free', canSee)).toEqual([]);
    expect(search.matchVisibleSettingsEntries(settingsConfig, 'groups', canSee).length).toBeGreaterThan(0);
  });

  it('hides a row whose page the nav does not link to', () => {
    const noGroups = settingsConfig.map((g) => ({ ...g, items: g.items.filter((i) => i.title !== 'Groups') }));
    expect(search.matchVisibleSettingsEntries(noGroups, 'penalty-free', all)).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(search.matchVisibleSettingsEntries(settingsConfig, '  ', all)).toEqual([]);
  });
});

describe('settingsPageLabel', () => {
  it('names a child as Parent: Child, and an index page by its parent', () => {
    expect(settingsPageLabel('/settings/billing/late-fees', settingsConfig)).toBe('Billing Rules: Late Fees');
    expect(settingsPageLabel('/settings/billing', settingsConfig)).toBe('Billing Rules');
    expect(settingsPageLabel('/settings/streets', settingsConfig)).toBe('Streets');
    expect(settingsPageLabel(null, settingsConfig)).toBeUndefined();
  });
});

describe('sidebar search', () => {
  it('replaces the nav with matching results and restores it when cleared', () => {
    render(<SettingsSidebar />);
    expect(screen.getByRole('link', { name: 'Late Fees' })).toBeInTheDocument();

    type('audit');
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveAttribute('href', '/system/audit-logs');
    expect(screen.queryByRole('link', { name: 'Late Fees' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/result/);

    type('');
    expect(screen.getByRole('link', { name: 'Late Fees' })).toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    render(<SettingsSidebar />);
    type('zebra');
    expect(screen.getByText('No settings match. Try a different word.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('No settings match');
  });

  it('finds a setting by an estate word kept in the registry keywords', () => {
    render(<SettingsSidebar />);
    type('penalty-free');
    expect(screen.getByRole('link', { name: /Redirect every message/ })).toHaveAttribute(
      'href',
      '/settings/groups?row=redirect-all#testing'
    );
  });

  it('does not offer a monitoring page the reader cannot open', () => {
    state.permissions = [PERMISSIONS.SETTINGS_MANAGE_BILLING];
    render(<SettingsSidebar />);
    type('audit');
    expect(screen.queryByRole('link', { name: /Audit Logs/ })).not.toBeInTheDocument();
  });

  it('opens the first result on Enter', () => {
    render(<SettingsSidebar />);
    type('audit');
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search settings' }), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/system/audit-logs');
  });
});

describe('mobile nav', () => {
  it('names the current page on the trigger', () => {
    render(<SettingsMobileNav />);
    expect(screen.getByRole('button', { name: /Billing Rules: Late Fees/ })).toBeInTheDocument();
  });

  it('has the search field inside the sheet', () => {
    render(<SettingsMobileNav />);
    fireEvent.click(screen.getByRole('button', { name: /Billing Rules: Late Fees/ }));
    type('audit');
    expect(screen.getByRole('link', { name: /Audit Logs/ })).toHaveAttribute('href', '/system/audit-logs');
  });
});
