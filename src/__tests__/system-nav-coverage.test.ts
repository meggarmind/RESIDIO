import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { ADMIN_NAV_SECTIONS } from '@/config/navigation';
import { oversightConfig } from '@/config/oversight-nav';
import { flattenSettingsNav } from '@/config/settings-nav';

/**
 * The /system sibling of settings-nav-coverage.test.ts.
 *
 * Keeps three descriptions of "what System contains" in step: the pages on
 * disk, the Oversight menu in oversight-nav.ts (#1272), and ROUTE_PERMISSIONS.
 *
 * This is the assertion that matters most: middleware skips the entire
 * authorization block when no ROUTE_PERMISSIONS key matches a path, so a
 * /system/* page shipped without its own guard is fully public, not merely
 * under-permissioned. See ADR-0004.
 */

const systemDir = fileURLToPath(new URL('../app/(dashboard)/(oversight)/system', import.meta.url));

/** Every /system route with a page.tsx. */
function routesOnDisk(dir = systemDir, prefix = '/system'): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (entry === 'page.tsx') found.push(prefix);
    else if (statSync(full).isDirectory()) found.push(...routesOnDisk(full, `${prefix}/${entry}`));
  }
  return found.sort();
}

function navItems() {
  // The /system pages; /analytics and /reports pages are covered by the Oversight block below.
  return flattenSettingsNav(oversightConfig).filter((item) => item.href.startsWith('/system'));
}

const navHrefs = new Set(navItems().map((i) => i.href));

/** The longest ROUTE_PERMISSIONS prefix matching a path — how middleware resolves. */
function guardFor(href: string): string | undefined {
  return Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => href === route || href.startsWith(route + '/'));
}

describe('system navigation coverage', () => {
  it('links only to pages that exist', () => {
    const onDisk = new Set(routesOnDisk());
    const dangling = [...navHrefs].filter((href) => !onDisk.has(href)).sort();

    expect(dangling).toEqual([]);
  });

  it('lists every system page that has one', () => {
    // Pages intentionally not a nav destination of their own (permanent
    // redirect stubs), following settings-nav-coverage.test.ts's REDIRECTS pattern.
    // Roles & Access moved to /settings/access (#939).
    const REDIRECTS = new Set<string>(['/system/accounts', '/system/data-tools']);

    const unlisted = routesOnDisk()
      .filter((route) => !navHrefs.has(route) && !REDIRECTS.has(route))
      .sort();

    expect(unlisted).toEqual([]);
  });

  it('guards every system route in middleware', () => {
    // The whole reason this test exists: a /system/* page with a page.tsx on
    // disk but no ROUTE_PERMISSIONS entry (direct or via prefix) is fully
    // public once middleware resolves it, because an unmatched path skips
    // the authorization block entirely rather than defaulting to deny.
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

describe('Oversight navigation (#1272)', () => {
  const entries = flattenSettingsNav(oversightConfig);
  const sidebar = ADMIN_NAV_SECTIONS.flatMap((section) => section.items);

  it('gives every entry a ROUTE_PERMISSIONS guard that its permissions match', () => {
    for (const entry of entries) {
      const guard = guardFor(entry.href);
      expect(guard, `${entry.href} has no ROUTE_PERMISSIONS guard`).toBeDefined();
      const required = ROUTE_PERMISSIONS[guard!];
      if (guard === entry.href) {
        expect(entry.permissions, entry.href).toEqual(required);
      } else {
        // Guarded by a parent prefix (e.g. /reports/financial-overview under /reports).
        expect(required, entry.href).toEqual(expect.arrayContaining(entry.permissions!));
      }
    }
  });

  it('links only pages that exist and no title twice', () => {
    const titles = entries.map((e) => e.title);
    expect(new Set(titles).size).toBe(titles.length);
    const appDir = fileURLToPath(new URL('../app/(dashboard)/(oversight)', import.meta.url));
    for (const { href } of entries) {
      expect(() => statSync(path.join(appDir, href, 'page.tsx')), href).not.toThrow();
    }
  });

  it('shows one sidebar entry, visible to a holder of any single Oversight permission', () => {
    const oversight = sidebar.find((item) => item.href === '/system')!;
    expect(oversight.title).toBe('Oversight');
    const union = new Set(entries.flatMap((e) => e.permissions ?? []));
    expect(new Set(oversight.permissions)).toEqual(union);
  });

  it('leaves no Analytics, Reports or System item in the sidebar', () => {
    for (const title of ['Analytics', 'Reports', 'System']) {
      expect(sidebar.find((item) => item.title === title), title).toBeUndefined();
    }
    expect(ADMIN_NAV_SECTIONS.at(-1)).toMatchObject({ id: 'admin', label: 'Admin' });
    expect(ADMIN_NAV_SECTIONS.at(-1)!.items.map((i) => i.title)).toEqual(['Oversight', 'Settings']);
  });
});
