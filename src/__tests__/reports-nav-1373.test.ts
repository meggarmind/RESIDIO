import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { ADMIN_NAV_SECTIONS, isNavHrefActive } from '@/config/navigation';
import { oversightConfig } from '@/config/oversight-nav';
import { flattenSettingsNav } from '@/config/settings-nav';
import { SETTINGS_SEARCH_ENTRIES } from '@/lib/search/settings-search-entries';
import { parseReportsTab } from '@/components/reports/reports-page-client';

/**
 * Reports has its own page and main menu entry under Dashboard (#1373, owner option C).
 * Its link must follow the page's own guard, so it never shows to a role the page redirects.
 */

const pageSource = readFileSync(
  fileURLToPath(new URL('../app/(dashboard)/reports/page.tsx', import.meta.url)),
  'utf8'
);
const pageGuard = pageSource.match(/authorizePermission\(PERMISSIONS\.(\w+)\)/)?.[1];

const core = ADMIN_NAV_SECTIONS.find((section) => section.id === 'core')!;
const reports = core.items.find((item) => item.id === 'reports')!;

describe('Reports main menu entry (#1373)', () => {
  it('sits directly under Dashboard in the first section', () => {
    expect(ADMIN_NAV_SECTIONS[0]).toBe(core);
    expect(core.items.map((item) => item.id)).toEqual(['dashboard', 'reports']);
    expect(reports).toMatchObject({ title: 'Reports', href: '/reports' });
  });

  it('has the three tab shortcuts, in order', () => {
    expect(reports.children!.map(({ title, href }) => ({ title, href }))).toEqual([
      { title: 'New report', href: '/reports?tab=new' },
      { title: 'History', href: '/reports?tab=recent' },
      { title: 'Schedules', href: '/reports?tab=schedules' },
    ]);
  });

  it('takes the page guard as its only permission, on the entry and every child', () => {
    expect(pageGuard).toBe('REPORTS_VIEW_FINANCIAL');
    const guard = PERMISSIONS[pageGuard as keyof typeof PERMISSIONS];
    for (const item of [reports, ...reports.children!]) {
      expect(item.permissions, item.id).toEqual([guard]);
      // And the middleware guard lets that permission through, so the link is never bounced.
      expect(ROUTE_PERMISSIONS['/reports']).toContain(guard);
    }
  });

  it('is gone from the Oversight menu, which keeps Income & expenses', () => {
    const hrefs = flattenSettingsNav(oversightConfig).map((entry) => entry.href);
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).toContain('/reports/financial-overview');
  });

  it('stays findable in the command palette, with the same permission as the link', () => {
    const entry = SETTINGS_SEARCH_ENTRIES.find((e) => e.href === '/reports');
    expect(entry).toMatchObject({ title: 'Generate reports', permissions: [PERMISSIONS.REPORTS_VIEW_FINANCIAL] });
  });
});

describe('isNavHrefActive', () => {
  const params = (query: string) => new URLSearchParams(query);

  it('matches a plain href on its exact path only', () => {
    expect(isNavHrefActive('/reports', '/reports', params('tab=recent'))).toBe(true);
    expect(isNavHrefActive('/reports', '/reports/financial-overview', params(''))).toBe(false);
  });

  it('matches a tab href only when that tab is open', () => {
    expect(isNavHrefActive('/reports?tab=recent', '/reports', params('tab=recent'))).toBe(true);
    expect(isNavHrefActive('/reports?tab=recent', '/reports', params('tab=new'))).toBe(false);
    expect(isNavHrefActive('/reports?tab=recent', '/reports', params(''))).toBe(false);
    expect(isNavHrefActive('/reports?tab=recent', '/reports', null)).toBe(false);
    expect(isNavHrefActive('/reports?tab=recent', '/billing', params('tab=recent'))).toBe(false);
  });
});

describe('parseReportsTab', () => {
  it('opens each known tab', () => {
    for (const tab of ['new', 'recent', 'schedules', 'archive', 'wallet-check']) {
      expect(parseReportsTab(tab)).toBe(tab);
    }
  });

  it('falls back to New Report for a missing or unknown value', () => {
    expect(parseReportsTab(null)).toBe('new');
    expect(parseReportsTab(undefined)).toBe('new');
    expect(parseReportsTab('')).toBe('new');
    expect(parseReportsTab('history')).toBe('new');
  });
});
