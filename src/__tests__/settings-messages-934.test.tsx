// @vitest-environment jsdom
//
// #934: reminders, wording, sending and announcements merged into four task pages (#791).
import * as React from 'react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { flattenSettingsNav, settingsConfig, type SettingsItem } from '@/config/settings-nav';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/settings/sending',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasAnyPermission: () => true }),
}));

import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsSectionsProvider } from '@/components/settings/settings-sections-provider';

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const PAGE_DIR = 'src/app/(dashboard)/settings';

const PAGES = ['/settings/reminders', '/settings/wording', '/settings/sending', '/settings/announcements'] as const;
const item = (href: string): SettingsItem => flattenSettingsNav(settingsConfig).find((i) => i.href === href)!;

/** Where each old route now lands (#934). */
const STUBS: Record<string, string> = {
  'notifications': '/settings/reminders',
  'notifications/reminders': '/settings/reminders#on-off',
  'notifications/reminders/schedule': '/settings/reminders#schedule',
  'notifications/templates': '/settings/wording#email',
  'notifications/schedules': '/settings/reminders',
  'email': '/settings/sending#channels',
  'email/debug': '/settings/sending#testing',
  'comms-override': '/settings/sending#testing',
  'message-templates': '/settings/announcements#templates',
  'announcement-categories': '/settings/announcements#categories',
};

describe('registry and page components agree', () => {
  const components = [
    'src/components/settings/messages/reminders-on-off-section.tsx',
    'src/components/settings/messages/reminder-schedule-section.tsx',
    'src/components/settings/messages/send-reminders-test-section.tsx',
    'src/components/settings/messages/email-wording-section.tsx',
    'src/components/settings/messages/email-delivery-sections.tsx',
    'src/components/settings/messages/testing-section.tsx',
    'src/components/settings/messages/announcement-templates-section.tsx',
    'src/components/settings/messages/announcement-categories-section.tsx',
  ];
  const source = components.map(read).join('\n');

  it('every registered section is rendered under its own id, and every rendered section is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.map((s) => s.id)).sort();
    const rendered = [...source.matchAll(/<SettingsSection[^>]*?\bid="([^"]+)"/g)].map((m) => m[1]).sort();
    // `testing` renders on two code paths (loading and loaded) but is one section.
    expect([...new Set(rendered)]).toEqual(registered);
  });

  it('every registered row is rendered by a SettingsRow, and every SettingsRow is registered', () => {
    const registered = PAGES.flatMap((href) => item(href).sections!.flatMap((s) => s.rows.map((r) => r.id))).sort();
    const literal = [...source.matchAll(/rowId="([^"]+)"/g)].map((m) => m[1]);
    // The three email types are rendered from a table of row ids.
    const table = [...source.matchAll(/rowId: '([^']+)'/g)].map((m) => m[1]);
    expect([...new Set([...literal, ...table])].sort()).toEqual(registered);
  });
});

describe('permissions: each section keeps its own, the route is their OR (#791 decision 9)', () => {
  it.each(PAGES)('%s opens for exactly the union of its sections', (href) => {
    const page = item(href);
    const union = new Set(page.sections!.flatMap((s) => s.permissions ?? page.permissions ?? []));
    expect(new Set(ROUTE_PERMISSIONS[href])).toEqual(union);
    expect(new Set(page.permissions)).toEqual(union);
  });

  it('keeps every old route key with its old permission (ADR-0004)', () => {
    expect(ROUTE_PERMISSIONS['/settings/notifications']).toEqual([PERMISSIONS.NOTIFICATIONS_MANAGE]);
    expect(ROUTE_PERMISSIONS['/settings/email']).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    expect(ROUTE_PERMISSIONS['/settings/comms-override']).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    expect(ROUTE_PERMISSIONS['/settings/message-templates']).toEqual([PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES]);
    expect(ROUTE_PERMISSIONS['/settings/announcement-categories']).toEqual([PERMISSIONS.ANNOUNCEMENTS_MANAGE_CATEGORIES]);
  });

  it('puts the manual reminder run only under settings.manage_general, as the Email Debug page had', () => {
    const sections = item('/settings/reminders').sections!;
    expect(sections.find((s) => s.id === 'send-test')?.permissions).toEqual([PERMISSIONS.SETTINGS_MANAGE_GENERAL]);
    expect(sections.find((s) => s.id === 'on-off')?.permissions).toEqual([PERMISSIONS.NOTIFICATIONS_MANAGE]);
  });
});

describe('old routes are redirect stubs', () => {
  it.each(Object.entries(STUBS))('/settings/%s redirects to %s', (route, target) => {
    const src = read(`${PAGE_DIR}/${route}/page.tsx`);
    expect(src).toContain(`redirect('${target}')`);
    expect(src).not.toContain("'use client'");
  });

  it('the nav no longer links to a merged route', () => {
    const hrefs = new Set(flattenSettingsNav(settingsConfig).map((i) => i.href));
    for (const route of Object.keys(STUBS)) expect(hrefs.has(`/settings/${route}`)).toBe(false);
    for (const page of PAGES) expect(hrefs.has(page)).toBe(true);
  });
});

describe('Email & sending Testing section', () => {
  const testing = item('/settings/sending').sections!.find((s) => s.id === 'testing')!;

  it('is collapsed by default and holds the redirect, the debug mode and the test email', () => {
    expect(testing.defaultCollapsed).toBe(true);
    expect(testing.rows.map((r) => r.id)).toEqual(['redirect-all', 'override-contacts', 'debug-mode', 'test-email']);
  });
});

function Section({ id, instant, warning }: { id: string; instant?: boolean; warning?: boolean }) {
  return (
    <SettingsSection id={id} title={id} summary="s" instant={instant} warning={warning} defaultCollapsed>
      <button>inside {id}</button>
    </SettingsSection>
  );
}

describe('SettingsSection instant and warning modes', () => {
  afterEach(cleanup);

  it('an instant section has no Save or Discard footer', () => {
    render(<Section id="send-test" instant />);
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.queryByText('No changes')).toBeNull();
  });

  it('a section that is not instant shows its footer while open and hides it when collapsed (#971)', () => {
    render(<Section id="channels" />);
    expect(screen.queryByRole('button', { name: 'Save channels' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'channels' }));
    expect(screen.getByRole('button', { name: 'Save channels' })).toBeDisabled();
  });

  it('a warning section says it needs attention', () => {
    render(<Section id="testing" instant warning />);
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
  });
});

describe('old-route redirects open the section named in the hash', () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('expands a collapsed section when the URL carries its #id', async () => {
    window.history.replaceState(null, '', '/settings/sending#testing');
    render(
      <SettingsSectionsProvider>
        <Section id="channels" instant />
        <Section id="testing" instant />
      </SettingsSectionsProvider>,
    );
    const toggle = await screen.findByRole('button', { name: 'testing' });
    await vi.waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: 'channels' })).toHaveAttribute('aria-expanded', 'false');
  });
});
