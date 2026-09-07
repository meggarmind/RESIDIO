import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { adminOnlyRoutes, isPublicRoute, publicRoutePrefixes } from '@/middleware';

/**
 * Structural test for the (dashboard) route group. See #104.
 *
 * Middleware is the only authentication gate for the admin dashboard; neither
 * the layout nor any page guards anything. The gate used to key off whether a
 * path matched a ROUTE_PERMISSIONS entry, so a route with no entry skipped the
 * whole auth block and was served to anyone, unauthenticated -- fully public,
 * not merely under-permissioned. Five real routes were in exactly that state:
 * /personnel, /projects, /expenditure, /analytics and /notifications.
 *
 * Two things now stop that regrowing, and this file asserts both:
 *
 *   1. The middleware default is inverted -- deny unless the path is on the
 *      `publicRoutePrefixes` allowlist -- so an unclassified route still needs
 *      a session even with no ROUTE_PERMISSIONS entry.
 *   2. Every (dashboard) segment carries an explicit permission entry and sits
 *      in `adminOnlyRoutes`, so it is authorized, not merely authenticated.
 *
 * The segment list is read from disk rather than hardcoded. That is the whole
 * point: a directory someone adds next month is picked up automatically and
 * fails here until it is registered, which is exactly how the five above should
 * have been caught.
 *
 * Compare src/__tests__/system-route-guard.test.ts, which does the same job for
 * the /system subtree.
 */

const DASHBOARD_DIR = join(process.cwd(), 'src', 'app', '(dashboard)');

/**
 * Immediate subdirectories of src/app/(dashboard)/ that are real routes.
 *
 * Skipped, because neither can be reached as `/<name>`:
 *  - anything starting with `_` (App Router private folders, opted out of routing);
 *  - any directory with no page.tsx of its own -- a layout-only or component-only
 *    folder has no `/<segment>` URL to guard. A child route underneath it would
 *    still be covered, since middleware matches by prefix.
 *
 * Route groups `(x)` and dynamic segments `[x]` cannot appear at this level in
 * this repo, and are excluded by the page.tsx check anyway.
 */
function dashboardSegments(): string[] {
    return readdirSync(DASHBOARD_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => !name.startsWith('_'))
        .filter((name) => existsSync(join(DASHBOARD_DIR, name, 'page.tsx')))
        .sort();
}

// Middleware's own resolution, reproduced: longest matching prefix wins.
const resolve = (routes: string[], pathname: string) =>
    [...routes].sort((a, b) => b.length - a.length).find((route) => pathname.startsWith(route));

describe('dashboard route guard', () => {
    const segments = dashboardSegments();

    it('finds the (dashboard) route group on disk', () => {
        // A guard on the guard. If the directory moved or the filter went wrong,
        // every assertion below would vacuously pass over an empty list.
        expect(segments.length).toBeGreaterThan(10);
        expect(segments).toContain('dashboard');
    });

    it('leaves no (dashboard) segment without a ROUTE_PERMISSIONS entry', () => {
        const routes = Object.keys(ROUTE_PERMISSIONS);

        for (const segment of segments) {
            const pathname = `/${segment}`;
            const guard = resolve(routes, pathname);
            expect(
                guard,
                `${pathname} falls through the route table with no permission entry -- ` +
                `add it to ROUTE_PERMISSIONS in src/lib/auth/action-roles.ts`,
            ).toBeDefined();
        }
    });

    it('lists every (dashboard) segment in adminOnlyRoutes', () => {
        // adminOnlyRoutes is what sends a resident who wanders onto an admin URL
        // back to /portal instead of into the admin shell.
        for (const segment of segments) {
            const pathname = `/${segment}`;
            const listed = adminOnlyRoutes.some((route) => pathname.startsWith(route));
            expect(
                listed,
                `${pathname} is not covered by adminOnlyRoutes in src/middleware.ts`,
            ).toBe(true);
        }
    });

    it('keeps the public allowlist clear of every (dashboard) segment', () => {
        // The inverted default is only as good as the allowlist. A prefix added
        // here that happens to cover a dashboard segment would make it public
        // again -- silently, and with no ROUTE_PERMISSIONS change to notice.
        for (const segment of segments) {
            const pathname = `/${segment}`;
            const matching = publicRoutePrefixes.filter((prefix) => pathname.startsWith(prefix));
            expect(
                matching,
                `${pathname} is made public by allowlist prefix(es) ${matching.join(', ')}`,
            ).toEqual([]);
            expect(isPublicRoute(pathname), `${pathname} is treated as a public route`).toBe(false);
        }
    });

    it('still admits the routes that must work without a session', () => {
        // The other half of the allowlist's job. Narrowing it until sign-in
        // itself is gated would be a self-inflicted outage, so pin the paths
        // that genuinely have to be reachable pre-auth.
        for (const pathname of [
            '/',
            '/login',
            '/register',
            '/forgot-password',
            '/reset-password',
            '/pending-approval',
            '/auth/callback',
            '/auth/verify-2fa',
            '/maintenance',
            '/api/health/cron-status',
        ]) {
            expect(isPublicRoute(pathname), `${pathname} must be reachable without a session`).toBe(true);
        }
    });

    it('treats / as an exact match, not a prefix', () => {
        // '/' is on the allowlist because src/app/page.tsx only redirects to
        // /dashboard. Matching it as a prefix would make the entire app public.
        expect(isPublicRoute('/')).toBe(true);
        expect(isPublicRoute('/residents')).toBe(false);
        expect(isPublicRoute('/nobody-has-built-this-yet')).toBe(false);
    });
});
