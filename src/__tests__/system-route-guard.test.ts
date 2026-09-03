import { describe, expect, it } from 'vitest';
import { ROUTE_PERMISSIONS, PERMISSIONS } from '@/lib/auth/action-roles';
import { adminOnlyRoutes } from '@/middleware';

/**
 * Structural test for the /system route guard.
 *
 * Middleware is the only authentication gate for the dashboard; neither the
 * layout nor the shell guards anything. When no ROUTE_PERMISSIONS key matches
 * a path, the entire authorization block is skipped rather than defaulting to
 * deny, so a /system route shipped without its own entry would be fully public,
 * not merely under-permissioned.
 *
 * This test ensures the generic /system entry exists as a safety net before
 * any /system/* page is created, and that /system is also in adminOnlyRoutes.
 *
 * See ADR-0004: Settings is configuration-only.
 */
describe('system route guard', () => {
  it('has /system in ROUTE_PERMISSIONS', () => {
    expect(ROUTE_PERMISSIONS).toHaveProperty('/system');
    expect(ROUTE_PERMISSIONS['/system']).toEqual([PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS]);
  });

  it('maps /system to SYSTEM_VIEW_ALL_SETTINGS permission', () => {
    const systemRoute = ROUTE_PERMISSIONS['/system'];
    expect(systemRoute).toContain(PERMISSIONS.SYSTEM_VIEW_ALL_SETTINGS);
  });

  it('catches every /system/* path via the generic entry', () => {
    // Middleware's own resolution, reproduced: longest matching prefix wins.
    const resolve = (routes: string[], pathname: string) =>
      [...routes].sort((a, b) => b.length - a.length).find((route) => pathname.startsWith(route));

    const routes = Object.keys(ROUTE_PERMISSIONS);

    // The point of this slice: no /system path may fall through unmatched,
    // because an unmatched path skips the authorization block entirely.
    for (const pathname of ['/system', '/system/audit-logs', '/system/accounts/pending']) {
      expect(resolve(routes, pathname)).toBe('/system');
    }
  });

  it('lets a more specific /system entry win over the generic one', () => {
    // Not asserted against the live table -- a fixed synthetic one, so this
    // proves the ordering property itself rather than restating whatever the
    // table happens to contain today. Later slices add /system/audit-logs and
    // friends; each must override the generic fallback, not be shadowed by it.
    const resolve = (routes: string[], pathname: string) =>
      [...routes].sort((a, b) => b.length - a.length).find((route) => pathname.startsWith(route));

    const routes = ['/system', '/system/audit-logs', '/settings'];

    expect(resolve(routes, '/system/audit-logs')).toBe('/system/audit-logs');
    expect(resolve(routes, '/system/anything-else')).toBe('/system');
  });

  it('includes /system in adminOnlyRoutes', () => {
    expect(adminOnlyRoutes).toContain('/system');
  });
});
