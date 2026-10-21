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
    expect(activeSettingsHref('/settings/billing/profiles', settingsConfig)).toBe('/settings/billing/profiles');
    expect(activeSettingsHref('/settings/billing/late-fees', settingsConfig)).toBe('/settings/billing');
  });

  it('highlights the nearest entry for a page with none of its own', () => {
    expect(activeSettingsHref('/settings/reminders/unlisted', settingsConfig)).toBe('/settings/reminders');
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

    expect(titles).toEqual(['Setup']);
  });
});

describe('settings nav grouping (#786, owner decision 2026-10-20)', () => {
  it('uses the agreed groups, in order', () => {
    expect(settingsConfig.map((group) => group.title)).toEqual([
      'Setup',
      'Estate & Property',
      'Money',
      'Messages',
      'Documents',
      'People & Access',
      'Connections',
      'System',
    ]);
  });

  it('puts the pages admins look for under the agreed labels', () => {
    const where = (href: string) => {
      const group = settingsConfig.find((g) => flattenSettingsNav([g]).some((i) => i.href === href && !i.children));
      const item = flattenSettingsNav(settingsConfig).find((i) => i.href === href && !i.children);
      return `${group?.title} > ${item?.title}`;
    };
    expect(where('/settings/estate-info')).toBe('Estate & Property > Estate Details');
    expect(where('/settings/billing')).toBe('Money > Billing Rules');
    expect(where('/settings/banking')).toBe('Money > Banking');
    expect(where('/settings/billing/profiles')).toBe('Money > Rate Cards');
    expect(where('/settings/sending')).toBe('Messages > Email & Sending');
    expect(where('/settings/reminders')).toBe('Messages > Reminders');
    expect(where('/settings/wording')).toBe('Messages > Message Wording');
    expect(where('/settings/announcements')).toBe('Messages > Announcements');
    expect(where('/settings/system')).toBe('System > Maintenance & Data');
    expect(where('/settings/whatsapp')).toBe('Connections > WhatsApp');
  });

  it('gives every page its own entry, with no label used twice', () => {
    const leaves = links.map((link) => link.title);
    expect(new Set(leaves).size).toBe(leaves.length);
    expect(new Set(links.map((link) => link.href)).size).toBe(links.length);
  });
});
