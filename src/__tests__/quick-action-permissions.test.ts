import { describe, expect, it } from 'vitest';

import { ROUTE_PERMISSIONS, PERMISSIONS } from '@/lib/auth/action-roles';
import { QUICK_ACTIONS } from '@/lib/search/quick-actions';

/**
 * Issue #164 made the command palette's Quick Actions permission-filtered.
 * That mapping is a hand-maintained table whose guards live in a different
 * file, and nothing else in the build would notice it going stale — the same
 * shape of gap that let a nav permission be silently narrowed earlier in this
 * epic (D21): the settings coverage test asserts nav permissions are a SUBSET
 * of the route's, so a narrowing keeps it green.
 *
 * These assertions run the other way round, and pin intent explicitly.
 */

/** The longest ROUTE_PERMISSIONS prefix matching a path — how middleware resolves. */
function guardFor(href: string): string | undefined {
  return Object.keys(ROUTE_PERMISSIONS)
    .sort((a, b) => b.length - a.length)
    .find((route) => href === route || route !== '/' && href.startsWith(route + '/'));
}

describe('Quick Action permissions', () => {
  it('every action carries the permission middleware gates its target route on', () => {
    for (const action of QUICK_ACTIONS) {
      const guard = guardFor(action.href);
      expect(guard, `${action.id} -> ${action.href} matches no ROUTE_PERMISSIONS entry`).toBeDefined();

      // Offering an action whose page the role cannot open is the defect #164
      // reports. `hasAllPermissions` requires every listed permission, so the
      // route's guard must appear in the action's list.
      const required = ROUTE_PERMISSIONS[guard as keyof typeof ROUTE_PERMISSIONS] as readonly string[];
      const satisfies = required.some((p) => (action.permissions as readonly string[]).includes(p));
      expect(satisfies, `${action.id} does not require any of ${guard}'s permissions`).toBe(true);
    }
  });

  it('actions that open a create form also require the create permission', () => {
    // The inverse defect, which a subset-style assertion cannot see: an action
    // gated only on `.view` is offered to a role that can open the form and
    // then be refused by the server action behind it. `/residents/new` and
    // `/houses/new` have no ROUTE_PERMISSIONS entry of their own, so middleware
    // admits them on the parent's `.view` and only this test holds the line.
    const expected: Record<string, string> = {
      'add-resident': PERMISSIONS.RESIDENTS_CREATE,
      'add-house': PERMISSIONS.HOUSES_CREATE,
    };

    for (const [id, permission] of Object.entries(expected)) {
      const action = QUICK_ACTIONS.find((a) => a.id === id);
      expect(action, `Quick Action '${id}' has gone missing`).toBeDefined();
      expect(action!.permissions as readonly string[]).toContain(permission);
    }
  });

  it('pins the full mapping, so a rename or a new action is a deliberate change', () => {
    expect(
      Object.fromEntries(QUICK_ACTIONS.map((a) => [a.id, [a.href, [...a.permissions].sort()]]))
    ).toEqual({
      'add-resident': ['/residents/new', ['residents.create', 'residents.view']],
      'create-invoice': ['/billing', ['billing.view']],
      'add-house': ['/houses/new', ['houses.create', 'houses.view']],
      'security-log': ['/security/logs', ['security.view']],
    });
  });
});
