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
    accessRows: [] as { role_id: string; role_name: string; permission_name: string | null }[],
    accessError: null as { message: string } | null,
    rpcCalls: [] as string[],
    getUserCalls: 0,
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
                getUser: async () => {
                    supabaseState.getUserCalls += 1;
                    return { data: { user: supabaseState.user }, error: null };
                },
                signOut: async () => ({ error: null }),
            },
            // Guarded-route permission lookups go through the Access module's
            // get_my_access() RPC (#535): one row per permission, or a single
            // row with permission_name null for a role that holds none.
            rpc: async (fn: string) => {
                supabaseState.rpcCalls.push(fn);
                return supabaseState.accessError
                    ? { data: null, error: supabaseState.accessError }
                    : { data: supabaseState.accessRows, error: null };
            },
            from: (table: string) => {
                const builder = {
                    select: () => builder,
                    eq: () => builder,
                    single: () => single(table),
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
        supabaseState.accessRows = [];
        supabaseState.accessError = null;
        supabaseState.rpcCalls = [];
        supabaseState.getUserCalls = 0;
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

    describe('permission resolution through the Access module (#535)', () => {
        // /personnel requires VENDORS_VIEW; /portal requires nothing.
        const GUARDED_PATH = '/personnel';
        const REQUIRED = 'view_vendors';

        beforeEach(() => {
            supabaseState.user = { id: 'user-1' };
            supabaseState.profile = {
                role_id: 'role-1',
                resident_id: null,
                approval_status: 'active',
                app_roles: { name: 'super_admin', category: 'admin' },
            };
        });

        const rows = (...names: (string | null)[]) =>
            names.map((permission_name) => ({ role_id: 'role-1', role_name: 'super_admin', permission_name }));

        function expectUnauthorized(response: Response) {
            expect(response.status).toBe(307);
            const target = new URL(response.headers.get('location') as string);
            expect(target.pathname).toBe('/dashboard');
            expect(target.searchParams.get('error')).toBe('unauthorized');
        }

        it('lets a user holding the required permission through', async () => {
            supabaseState.accessRows = rows(REQUIRED, 'residents.view');
            const response = await middleware(request(GUARDED_PATH));
            expect(response.headers.get('location')).toBeNull();
            expect(response.status).toBe(200);
            expect(supabaseState.rpcCalls).toEqual(['get_my_access']);
        });

        it('lets through a user holding any one of several required permissions', async () => {
            // /reports accepts any of three report permissions.
            supabaseState.accessRows = rows('reports.view_security');
            const response = await middleware(request('/reports'));
            expect(response.headers.get('location')).toBeNull();
            expect(response.status).toBe(200);
        });

        it('redirects a user without the required permission to /dashboard?error=unauthorized', async () => {
            supabaseState.accessRows = rows('residents.view');
            expectUnauthorized(await middleware(request(GUARDED_PATH)));
        });

        it('redirects a role with no permissions at all (single null row)', async () => {
            supabaseState.accessRows = rows(null);
            expectUnauthorized(await middleware(request(GUARDED_PATH)));
        });

        it('redirects when the lookup returns zero rows (no-access)', async () => {
            supabaseState.accessRows = [];
            expectUnauthorized(await middleware(request(GUARDED_PATH)));
        });

        it('fails closed and logs when the RPC errors (lookup-failed)', async () => {
            supabaseState.accessError = { message: 'rpc exploded' };
            const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
            try {
                expectUnauthorized(await middleware(request(GUARDED_PATH)));
                expect(spy).toHaveBeenCalledWith('[middleware] access lookup failed', {
                    userId: 'user-1',
                    error: 'rpc exploded',
                });
            } finally {
                spy.mockRestore();
            }
        });

        it('does not call the RPC for a route that requires no permission', async () => {
            // /dashboard has an empty required list and does not return early,
            // so only the `requiredPermissions.length > 0` guard keeps the RPC unused.
            const response = await middleware(request('/dashboard'));
            expect(response.status).toBe(200);
            expect(response.headers.get('location')).toBeNull();
            expect(supabaseState.rpcCalls).toEqual([]);
        });

        it('does not call the RPC when the profile has no role_id, and redirects', async () => {
            supabaseState.profile = { ...supabaseState.profile, role_id: null };
            expectUnauthorized(await middleware(request(GUARDED_PATH)));
            expect(supabaseState.rpcCalls).toEqual([]);
        });

        it("performs no getUser() beyond the middleware's own", async () => {
            supabaseState.accessRows = rows(REQUIRED);
            await middleware(request(GUARDED_PATH));
            expect(supabaseState.rpcCalls).toEqual(['get_my_access']);
            expect(supabaseState.getUserCalls).toBe(1);
        });
    });
});
