import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_NAV_SECTIONS } from '@/config/navigation';
import { oversightConfig } from '@/config/oversight-nav';
import { flattenSettingsNav } from '@/config/settings-nav';
import { isNavHrefActive } from '@/config/nav-active';
import { REPORTS_TABS, parseReportsTab } from '@/components/reports/reports-tabs';
import { PERMISSIONS } from '@/lib/auth/action-roles';

describe('Reports in the main menu (#1373)', () => {
  const core = ADMIN_NAV_SECTIONS.find((section) => section.id === 'core')!;

  it('sits right after Dashboard in the first section', () => {
    expect(ADMIN_NAV_SECTIONS[0]).toBe(core);
    expect(core.items.map((item) => item.title)).toEqual(['Dashboard', 'Reports']);
    expect(core.items[1].href).toBe('/reports');
  });

  it('has New report, History and Schedules children that open those tabs', () => {
    const reports = core.items[1];
    expect(reports.children?.map((c) => [c.title, c.href])).toEqual([
      ['New report', '/reports?tab=new'],
      ['History', '/reports?tab=recent'],
      ['Schedules', '/reports?tab=schedules'],
    ]);
  });

  it('asks for the page guard permission, on the entry and on every child', () => {
    const reports = core.items[1];
    expect(reports.permissions).toEqual([PERMISSIONS.REPORTS_VIEW_FINANCIAL]);
    for (const child of reports.children!) {
      expect(child.permissions, child.title).toEqual([PERMISSIONS.REPORTS_VIEW_FINANCIAL]);
    }
  });

  it('every child tab is a real tab of the page', () => {
    for (const child of core.items[1].children!) {
      const tab = new URLSearchParams(child.href.split('?')[1]).get('tab');
      expect(REPORTS_TABS as readonly string[], child.href).toContain(tab);
    }
  });
});

describe('Oversight menu without Generate reports (#1373)', () => {
  const hrefs = flattenSettingsNav(oversightConfig).map((item) => item.href);

  it('no longer lists /reports but keeps Income & expenses', () => {
    expect(hrefs).not.toContain('/reports');
    expect(hrefs).toContain('/reports/financial-overview');
  });

  it('moved the page out of the Oversight route group, and left Income & expenses in it', () => {
    const app = join(process.cwd(), 'src/app/(dashboard)');
    expect(existsSync(join(app, 'reports/page.tsx'))).toBe(true);
    expect(existsSync(join(app, '(oversight)/reports/page.tsx'))).toBe(false);
    expect(existsSync(join(app, '(oversight)/reports/financial-overview/page.tsx'))).toBe(true);
  });
});

describe('parseReportsTab (#1373)', () => {
  it('accepts every tab value', () => {
    for (const tab of ['new', 'recent', 'schedules', 'archive', 'wallet-check']) {
      expect(parseReportsTab(tab)).toBe(tab);
    }
  });

  it('falls back to new for an unknown, empty or missing value', () => {
    expect(parseReportsTab('bogus')).toBe('new');
    expect(parseReportsTab('')).toBe('new');
    expect(parseReportsTab(null)).toBe('new');
    expect(parseReportsTab(undefined)).toBe('new');
  });
});

describe('isNavHrefActive (#1373)', () => {
  const at = (query: string) => new URLSearchParams(query);

  it('lights only the child whose tab is in the address', () => {
    const active = ['new', 'recent', 'schedules'].filter((tab) =>
      isNavHrefActive('/reports', at('tab=recent'), `/reports?tab=${tab}`)
    );
    expect(active).toEqual(['recent']);
  });

  it('is off when the tab is missing or the path differs', () => {
    expect(isNavHrefActive('/reports', at(''), '/reports?tab=new')).toBe(false);
    expect(isNavHrefActive('/reports', null, '/reports?tab=new')).toBe(false);
    expect(isNavHrefActive('/reports/financial-overview', at('tab=new'), '/reports?tab=new')).toBe(false);
  });

  it('treats a missing key as its default value when given one', () => {
    expect(isNavHrefActive('/reports', at(''), '/reports?tab=new', { defaults: { tab: 'new' } })).toBe(true);
    expect(isNavHrefActive('/reports', at(''), '/reports?tab=recent', { defaults: { tab: 'new' } })).toBe(false);
    expect(isNavHrefActive('/reports', at('tab=recent'), '/reports?tab=new', { defaults: { tab: 'new' } })).toBe(false);
  });

  it('keeps the old path-only behaviour for a plain href', () => {
    expect(isNavHrefActive('/payments', at('tab=x'), '/payments')).toBe(true);
    expect(isNavHrefActive('/payments/new', at(''), '/payments')).toBe(false);
    expect(isNavHrefActive('/payments/new', at(''), '/payments', { prefix: true })).toBe(true);
  });
});
