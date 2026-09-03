import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { settingsConfig, type SettingsItem } from '@/config/settings-nav';

/**
 * Keeps three descriptions of "what Settings contains" in step: the pages on
 * disk, the sidebar config, and the middleware's route table.
 *
 * They had drifted in every direction. The sidebar omitted pages that existed,
 * carried a link to a page that had been deleted, and gated nothing — while the
 * middleware guarded four of roughly thirty settings routes, so the rest were
 * reachable by any authenticated admin whatever their role had been granted.
 */

const settingsDir = fileURLToPath(new URL('../app/(dashboard)/settings', import.meta.url));

/** Every /settings route with a page.tsx. */
function routesOnDisk(dir = settingsDir, prefix = '/settings'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === 'page.tsx') found.push(prefix);
    else if (statSync(full).isDirectory()) found.push(...routesOnDisk(full, `${prefix}/${entry}`));
  }
  return found.sort();
}

function navItems(): SettingsItem[] {
  const flatten = (items: SettingsItem[]): SettingsItem[] =>
    items.flatMap((item) => (item.children ? [item, ...flatten(item.children)] : [item]));
  return settingsConfig.flatMap((group) => flatten(group.items));
}

const navHrefs = new Set(navItems().map((i) => i.href));

/** The longest ROUTE_PERMISSIONS prefix matching a path — how middleware resolves. */
function guardFor(href: string): string | undefined {
  return Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => href === route || href.startsWith(route + '/'));
}

describe('settings navigation coverage', () => {
  it('links only to pages that exist', () => {
    const onDisk = new Set(routesOnDisk());
    const dangling = [...navHrefs].filter((href) => !onDisk.has(href)).sort();

    expect(dangling).toEqual([]);
  });

  it('lists every settings page that has one', () => {
    // /settings/user-roles is a permanent redirect into /settings/roles, and
    // /settings/audit-logs, /settings/notification-queue and
    // /settings/notifications/history are permanent redirects into their
    // /system/* equivalents (see ADR-0004: Settings is configuration-only),
    // so none of these are intentionally a nav destination of their own.
    const REDIRECTS = new Set([
      '/settings/user-roles',
      '/settings/audit-logs',
      '/settings/notification-queue',
      '/settings/notifications/history',
    ]);

    const unlisted = routesOnDisk()
      .filter((route) => !navHrefs.has(route) && !REDIRECTS.has(route))
      .sort();

    expect(unlisted).toEqual([]);
  });

  it('guards every settings route in middleware', () => {
    const unguarded = routesOnDisk()
      .filter((route) => guardFor(route) === undefined)
      .sort();

    expect(unguarded).toEqual([]);
  });

  it('never shows a link the middleware would bounce', () => {
    // A nav entry's permissions must satisfy the route guard it will hit —
    // otherwise the sidebar advertises a page and the middleware redirects to
    // /dashboard?error=unauthorized, which reads as a broken app.
    const contradictions = navItems()
      .filter((item) => item.permissions?.length)
      .map((item) => ({ item, guard: guardFor(item.href) }))
      .filter(({ item, guard }) => {
        if (!guard) return false;
        const required = ROUTE_PERMISSIONS[guard];
        if (required.length === 0) return false;
        // Any permission that reveals the link must also open the route.
        return !item.permissions!.every((p) => required.includes(p));
      })
      .map(({ item, guard }) => `${item.href} (nav: ${item.permissions!.join(', ')} / guard ${guard}: ${ROUTE_PERMISSIONS[guard!].join(', ')})`)
      .sort();

    expect(contradictions).toEqual([]);
  });
});
