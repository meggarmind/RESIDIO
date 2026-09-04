import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { ADMIN_NAV_SECTIONS, type NavItem } from '@/config/navigation';

/**
 * The /system sibling of settings-nav-coverage.test.ts.
 *
 * Keeps three descriptions of "what System contains" in step: the pages on
 * disk, the `system` nav section in navigation.ts, and ROUTE_PERMISSIONS.
 *
 * Unlike Settings, System has no dedicated sidebar config file — its pages
 * are nav items directly inside the `system` NavSection in navigation.ts.
 *
 * This is the assertion that matters most: middleware skips the entire
 * authorization block when no ROUTE_PERMISSIONS key matches a path, so a
 * /system/* page shipped without its own guard is fully public, not merely
 * under-permissioned. See ADR-0004.
 */

const systemDir = fileURLToPath(new URL('../app/(dashboard)/system', import.meta.url));

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

function navItems(): NavItem[] {
  const flatten = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => (item.children ? [item, ...flatten(item.children)] : [item]));

  const systemSection = ADMIN_NAV_SECTIONS.find((section) => section.id === 'system');
  if (!systemSection) return [];

  // Only items actually under /system — NAV_SETTINGS also lives in this
  // section (href /settings) and is covered by the Settings test instead.
  return flatten(systemSection.items).filter((item) => item.href.startsWith('/system'));
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
    // Exception list for pages intentionally not a nav destination of their
    // own (e.g. permanent redirect stubs). Empty today — add here, following
    // settings-nav-coverage.test.ts's REDIRECTS pattern, if a later slice
    // under /system needs one.
    const REDIRECTS = new Set<string>([]);

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
