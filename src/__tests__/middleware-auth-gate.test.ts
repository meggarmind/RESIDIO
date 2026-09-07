import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavioural test for the middleware authentication gate. See #104.
 *
 * Middleware is the ONLY authentication gate for the admin dashboard: no layout
 * and no page guards anything. Before #104 the gate sat inside
 * `if (protectedRoute)`, so any path with no `routePermissionConfig` entry
 * skipped authentication entirely and was served to anonymous visitors with a
 * 200. Five real routes were in that state (/personnel, /projects,
 * /expenditure, /analytics, /notifications).
 *
 * src/__tests__/dashboard-route-guard.test.ts asserts the *configuration* is
 * consistent with the filesystem. It never executes `middleware()`, so it stays
 * green if the gate is deleted or reverted to the vulnerable
 * `if (protectedRoute && !user)`. This file closes that hole by calling the real
 * `middleware()` and asserting on the NextResponse it returns.
 *
 * The load-bearing case is UNREGISTERED_PATH below: a path with no
 * ROUTE_PERMISSIONS entry, which only the inverted deny-by-default rule can
 * catch. If that assertion ever passes under `if (protectedRoute && !user)`,
 * the test is not doing its job.
 *
 * Scope: the authentication gate only. The permission/authorization block, the
 * approval gate, maintenance mode and the /portal branch need far heavier
 * mocking and are covered elsewhere.
 */

const supabaseState = vi.hoisted(() => ({
    user: null as { id: string } | null,
    profile: null as Record<string, unknown> | null,
    rolePermissions: [] as { permission: { name: string } }[],
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => {
        // Only the methods middleware actually reaches are modelled:
        // auth.getUser() always, and from('system_settings') /
        // from('profiles') only once a user exists.
        const single = async (table: string) =>
            table === 'profiles'
                ? { data: supabaseState.profile, error: null }
                : { data: null, error: null };

        return {
            auth: {
                getUser: async () => ({ data: { user: supabaseState.user }, error: null }),
                signOut: async () => ({ error: null }),
            },
            from: (table: string) => {
                // The role_permissions lookup is awaited on the builder itself
                // rather than via .single(), so the builder is thenable too.
                const builder = {
                    select: () => builder,
                    eq: () => builder,
                    single: () => single(table),
                    then: (
                        resolve: (value: { data: unknown; error: null }) => unknown,
                    ) => Promise.resolve({ data: supabaseState.rolePermissions, error: null }).then(resolve),
                };
                return builder;
            },
        };
    },
}));

const { middleware } = await import('@/middleware');

const request = (pathname: string) =>
    new NextRequest(new URL(`http://localhost:3000${pathname}`));

/** The redirect middleware is expected to issue for an unauthenticated visitor. */
function expectLoginRedirect(response: Response, pathname: string) {
    expect(response.status, `${pathname} was not redirected (status ${response.status})`).toBe(307);

    const location = response.headers.get('location');
    expect(location, `${pathname} produced no Location header`).toBeTruthy();

    const target = new URL(location as string);
    expect(target.pathname, `${pathname} was redirected to ${target.pathname}, not /login`).toBe('/login');
    expect(
        target.searchParams.get('next'),
        `${pathname} lost its ?next= round-trip target`,
    ).toBe(pathname);
}

/** True when middleware bounced this request to /login. */
function redirectsToLogin(response: Response): boolean {
    if (response.status !== 307 && response.status !== 302) return false;
    const location = response.headers.get('location');
    if (!location) return false;
    return new URL(location).pathname === '/login';
}

/**
 * A dashboard path nobody has registered. It has no routePermissionConfig
 * entry, so `protectedRoute` is undefined and ONLY the inverted default stops
 * it being served anonymously.
 */
const UNREGISTERED_PATH = '/nobody-has-built-this-yet';

/** The five routes #104 found being served to anonymous visitors with a 200. */
const ROUTES_FROM_ISSUE_104 = [
    '/personnel',
    '/projects',
    '/expenditure',
    '/analytics',
    '/notifications',
];

/**
 * Paths that must remain reachable without a session. `/` is public at this
 * layer only -- src/app/page.tsx does its own redirect('/dashboard') -- so the
 * assertion here is deliberately narrow: middleware must not send it to /login.
 */
const PUBLIC_PATHS = [
    '/',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/maintenance',
    '/auth/callback',
    '/api/health',
];

describe('middleware authentication gate (#104)', () => {
    beforeEach(() => {
        supabaseState.user = null;
        supabaseState.profile = null;
        supabaseState.rolePermissions = [];
    });

    describe('unauthenticated', () => {
        it('redirects an unregistered dashboard path to /login', async () => {
            // The single most important assertion in this file: this path has no
            // ROUTE_PERMISSIONS entry, so it is served anonymously under the
            // pre-#104 `if (protectedRoute && !user)` condition.
            const response = await middleware(request(UNREGISTERED_PATH));
            expectLoginRedirect(response, UNREGISTERED_PATH);
        });

        it.each(ROUTES_FROM_ISSUE_104)('redirects %s to /login', async (pathname) => {
            const response = await middleware(request(pathname));
            expectLoginRedirect(response, pathname);
        });

        it.each(PUBLIC_PATHS)('does not redirect %s to /login', async (pathname) => {
            const response = await middleware(request(pathname));
            expect(
                redirectsToLogin(response),
                `${pathname} must be reachable without a session, but middleware sent it to /login`,
            ).toBe(false);
        });
    });

    describe('authenticated', () => {
        beforeEach(() => {
            supabaseState.user = { id: 'user-1' };
            supabaseState.profile = {
                role_id: 'role-1',
                resident_id: null,
                approval_status: 'active',
                app_roles: { name: 'super_admin', category: 'admin' },
            };
        });

        it('does not redirect an active admin away from an unregistered path', async () => {
            const response = await middleware(request(UNREGISTERED_PATH));
            expect(
                redirectsToLogin(response),
                'an authenticated, active user must not be bounced to /login',
            ).toBe(false);
        });

        it.each(ROUTES_FROM_ISSUE_104)('does not send an active admin on %s to /login', async (pathname) => {
            const response = await middleware(request(pathname));
            expect(redirectsToLogin(response), `${pathname} bounced an authenticated user to /login`).toBe(false);
        });
    });
});
