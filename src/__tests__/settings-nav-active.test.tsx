// @vitest-environment jsdom
//
// #786: exactly one settings nav entry is highlighted on every settings page,
// and the permission filter hides what a narrow role cannot open.

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { activeSettingsHref, flattenSettingsNav, settingsConfig } from '@/config/settings-nav';

const auth = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasAnyPermission: (ps: string[]) => ps.some((p) => auth.permissions.includes(p)),
  }),
}));

import { useSettingsNavigation } from '@/hooks/use-settings-navigation';

const routes = [...new Set(flattenSettingsNav(settingsConfig).map((item) => item.href))];

/** The links each nav renders: a parent is a label, so only leaf entries are links. */
const links = settingsConfig.flatMap((group) => group.items.flatMap((item) => item.children ?? [item]));

describe('activeSettingsHref', () => {
  it.each(routes)('highlights exactly one link on %s', (route) => {
    const active = activeSettingsHref(route, settingsConfig);
    expect(active).toBe(route);
    expect(links.filter((link) => link.href === active)).toHaveLength(1);
  });

  it('picks the longest match, not the first prefix', () => {
    expect(activeSettingsHref('/settings/notifications/reminders/schedule', settingsConfig)).toBe(
      '/settings/notifications/reminders/schedule'
    );
    expect(activeSettingsHref('/settings/billing/late-fees', settingsConfig)).toBe('/settings/billing/late-fees');
  });

  it('highlights the nearest entry for a page with none of its own', () => {
    expect(activeSettingsHref('/settings/notifications/schedules', settingsConfig)).toBe('/settings/notifications');
  });

  it('matches whole path segments only', () => {
    expect(activeSettingsHref('/settings/streetsx', settingsConfig)).toBe('/settings');
    expect(activeSettingsHref('/residents', settingsConfig)).toBeNull();
  });
});

describe('useSettingsNavigation permission filter', () => {
  it('gives a SETTINGS_VIEW-only role a short, non-empty nav', () => {
    auth.permissions = [PERMISSIONS.SETTINGS_VIEW];
    const { result } = renderHook(() => useSettingsNavigation());
    const hrefs = flattenSettingsNav(result.current.groups).map((item) => item.href);

    expect(hrefs.length).toBeGreaterThan(0);
    expect(hrefs.length).toBeLessThan(routes.length);
    expect(hrefs).toContain('/settings');
  });

  it('drops a group the role has no permission for', () => {
    auth.permissions = [PERMISSIONS.SETTINGS_VIEW];
    const { result } = renderHook(() => useSettingsNavigation());
    const titles = result.current.groups.map((group) => group.title);

    expect(titles).toContain('Estate');
    expect(titles).not.toContain('Integrations');
    expect(titles).not.toContain('Maintenance & Data');
  });
});
