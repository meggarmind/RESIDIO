import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { ROUTE_PERMISSIONS, Permission, extractRole, isAdminRole } from '@/lib/auth/action-roles';
import { resolveAccess, toAccessClient } from '@/lib/auth/access';
import { getPublicOrigin } from '@/lib/http/public-origin';
import { TWO_FACTOR_COOKIE, getSessionIdFromAccessToken, verifyTwoFactorMarker } from '@/lib/auth/two-factor-marker';
import type { ProfileApprovalStatus } from '@/types/database';
import { OPS_STATUS_COOKIE, OPS_STATUS_KEYS, encodeOpsStatus, opsStatusFromRows, type OpsStatus } from '@/lib/settings/ops-status';

/**
 * Routes the middleware guards, and what each requires.
 *
 * ROUTE_PERMISSIONS is consumed directly. A hand-written copy used to live here
 * and index into it entry by entry, which meant adding a route there changed
 * nothing -- and the copy had silently dropped eight routes it already defined
 * (/settings/appearance, /settings/document-categories, /settings/email-integration,
 * /settings/announcement-categories, /settings/message-templates,
 * /payments/email-imports, /documents and /announcements), leaving them
 * unenforced.
 *
 * /portal is middleware-only: access there is decided by resident_id, not by a
 * permission.
 */
const routePermissionConfig: Record<string, Permission[]> = {
    ...ROUTE_PERMISSIONS,
    '/portal': [],
};

// Admin routes that residents should NOT access.
// Must cover every immediate subdirectory of src/app/(dashboard)/ —
// dashboard-route-guard.test.ts enumerates that directory from disk and fails
// if one is missing here.
export const adminOnlyRoutes = [
    '/residents', '/houses', '/payments', '/billing', '/security',
    '/reports', '/approvals', '/settings', '/system', '/dashboard',
    // Added by #104 alongside their new ROUTE_PERMISSIONS entries.
    '/personnel', '/projects', '/expenditure', '/analytics', '/notifications',
    // Also (dashboard) segments, and also absent here before #104: both had
    // ROUTE_PERMISSIONS entries, so a resident hitting them was bounced to
    // /dashboard?error=unauthorized rather than to the portal. Listing them
    // sends residents where they belong instead.
    '/announcements', '/documents',
    '/collections',
];

/**
 * Public route allowlist — the ONLY paths served without a session.
 *
 * Middleware is the sole authentication gate for the admin dashboard: no layout
 * and no page guards anything. Before #104 the gate keyed off whether a path
 * matched `routePermissionConfig`, so a route with no entry skipped the entire
 * auth block and was served to anyone, unauthenticated. Five real routes were in
 * exactly that state (/personnel, /projects, /expenditure, /analytics,
 * /notifications).
 *
 * The default is therefore inverted: deny unless explicitly listed here. A route
 * added tomorrow with no ROUTE_PERMISSIONS entry still requires a session.
 *
 * /api is deliberately public *at this layer* — those routes carry their own
 * guards (CRON_SECRET, webhook signature verification, per-route permission
 * checks) and some must be reachable pre-auth.
 */
export const publicRoutePrefixes = [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/pending-approval',
    '/auth',
    '/maintenance',
    '/privacy-policy',
    '/api',
];

/**
 * `/` is public as an exact match only: src/app/page.tsx just redirects to
 * /dashboard, and treating it as a prefix would make every path public.
 */
export function isPublicRoute(pathname: string): boolean {
    if (pathname === '/') return true;
    // The public admin guide (#1238), matched by path segment so a future /guides page stays private.
    if (pathname === '/guide' || pathname.startsWith('/guide/')) return true;
    return publicRoutePrefixes.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Paths an enrolled user may reach before completing the second factor (#455):
 * the verify page and its API, the sign-in/out and recovery pages, the auth
 * callback and the pending/maintenance notices. Everything else -- every
 * dashboard and portal route and every other /api route -- needs the marker.
 */
const twoFactorExemptPrefixes = [
    '/auth/verify-2fa',
    '/auth/callback',
    '/api/auth/2fa',
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/pending-approval',
    '/maintenance',
];

/** Exact match or a path-segment child: /login and /login/x, never /loginx or /auth/verify-2fa.evil. */
export function isTwoFactorExemptPath(pathname: string): boolean {
    return twoFactorExemptPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

// Routes that should be accessible even during maintenance mode
const maintenanceExemptRoutes = ['/login', '/maintenance', '/pending-approval', '/api'];

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({
        request,
    });

    const supabase = createServerClient(
        supabaseConfig.url,
        supabaseConfig.anonKey,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    request.cookies.set({ name, value, ...options });
                    response = NextResponse.next({
                        request,
                    });
                    response.cookies.set({ name, value, ...options });
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({ name, value: '', ...options });
                    response = NextResponse.next({
                        request,
                    });
                    response.cookies.set({ name, value: '', ...options });
                },
            },
        }
    );

    const pathname = request.nextUrl.pathname;
    // Redirect targets must use the public origin, not request.url (#417).
    const publicOrigin = getPublicOrigin(request);

    // Check if route requires authentication
    const sortedRoutes = Object.keys(routePermissionConfig).sort((a, b) => b.length - a.length);
    const protectedRoute = sortedRoutes.find(route =>
        pathname.startsWith(route)
    );
    const isExemptRoute = maintenanceExemptRoutes.some(route => pathname.startsWith(route));

    // PERFORMANCE: getUser() first, then batch maintenance check and
    // profiles query into a single Promise.all round trip.
    let isMaintenanceMode = false;
    // Null when the settings read was skipped or failed: the banner cookie is then left as it was.
    let opsStatus: OpsStatus | null = null;
    let profileQueryFailed = false;
    let profile: {
        role_id: string | null;
        resident_id: string | null;
        approval_status: ProfileApprovalStatus | null;
        two_factor_enabled?: boolean | null;
        app_roles?: unknown;
    } | null = null;

    const { data: userAuthData } = await supabase.auth.getUser();
    const user = userAuthData.user;

    if (user) {
        const [maintenanceData, profileData] = await Promise.all([
            !isExemptRoute
                // comms_override_enabled rides along for the admin banner (#789) rather than costing its own query.
                ? supabase.from('system_settings').select('key, value').in('key', [...OPS_STATUS_KEYS])
                : Promise.resolve({ data: null, error: null }),
            supabase
                .from('profiles')
                .select('role_id, resident_id, approval_status, two_factor_enabled, app_roles!profiles_role_id_fkey (name, category)')
                .eq('id', user.id)
                .single(),
        ]);
        profile = profileData?.data || null;
        // PGRST116 is "no row" (a legitimately missing profile). Any other error
        // means we could not establish whether 2FA applies, so we must not guess.
        profileQueryFailed = !!profileData?.error && profileData.error.code !== 'PGRST116';
        if (maintenanceData?.data && !maintenanceData.error) {
            opsStatus = opsStatusFromRows(maintenanceData.data);
            isMaintenanceMode = opsStatus.maintenance;
        }
    }

    // Fail closed when the profile lookup itself errored (#455): without it the
    // two-factor and approval checks below would silently be skipped.
    if (user && profileQueryFailed && !isTwoFactorExemptPath(pathname)) {
        console.error('[middleware] profile query failed for authenticated user; failing closed');
        if (pathname.startsWith('/api')) {
            return NextResponse.json({ error: 'profile_unavailable' }, { status: 403 });
        }
        const redirectUrl = new URL('/login', publicOrigin);
        redirectUrl.searchParams.set('error', 'profile_unavailable');
        return NextResponse.redirect(redirectUrl);
    }

    // Approval gate. Accounts that are not active hold no permissions at the
    // database level either (the RLS helpers are gated on approval_status), so
    // this is a redirect for the user's benefit rather than the enforcement
    // boundary. Runs before the maintenance check so a pending user gets the
    // explanation that actually applies to them.
    if (user && !pathname.startsWith('/api')) {
        const status = profile?.approval_status ?? null;

        // A revoked account is signed out wherever it lands, /login included —
        // otherwise it would keep a live session it can no longer use.
        if (status === 'rejected' || status === 'suspended') {
            await supabase.auth.signOut();
            if (pathname !== '/login') {
                const redirectUrl = new URL('/login', publicOrigin);
                redirectUrl.searchParams.set('error', `account_${status}`);
                return NextResponse.redirect(redirectUrl);
            }
        } else if (status !== 'active'
            && !pathname.startsWith('/pending-approval')
            && !pathname.startsWith('/login')) {
            return NextResponse.redirect(new URL('/pending-approval', publicOrigin));
        }
    }

    // Handle maintenance mode
    // The role name comes from the profiles join above, so no extra round trip.
    const role = profile ? extractRole(profile.app_roles) : null;
    const roleName = role?.name ?? null;

    if (!isExemptRoute && isMaintenanceMode) {
        if (roleName !== 'super_admin') {
            return NextResponse.redirect(new URL('/maintenance', publicOrigin));
        }
    }

    // Second-factor gate (#455). An enrolled user holds a half-authenticated
    // session after the password step; nothing but the verify flow is served
    // until a signed marker for THIS user and session is present. Fails closed:
    // a missing session id, bad signature or unavailable secret all redirect.
    if (user && profile?.two_factor_enabled && !isTwoFactorExemptPath(pathname)) {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionId = getSessionIdFromAccessToken(sessionData?.session?.access_token);
        const verified = await verifyTwoFactorMarker(
            request.cookies.get(TWO_FACTOR_COOKIE)?.value,
            { userId: user.id, sessionId }
        );

        if (!verified) {
            if (pathname.startsWith('/api')) {
                return NextResponse.json({ error: 'two_factor_required' }, { status: 403 });
            }
            const redirectUrl = new URL('/auth/verify-2fa', publicOrigin);
            if (pathname !== '/') redirectUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(redirectUrl);
        }
    }

    // Authentication gate — deny by default.
    //
    // This used to sit inside `if (protectedRoute)`, which meant a path with no
    // routePermissionConfig entry was served to anyone. It is now keyed off the
    // public allowlist instead, so an unrecognised path requires a session.
    // Every routePermissionConfig key is non-public, so this is a superset of
    // the old behaviour for the routes that were already guarded.
    if (!isPublicRoute(pathname) && !user) {
        const redirectUrl = new URL('/login', publicOrigin);
        redirectUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(redirectUrl);
    }

    // Authorization. Only runs when an entry matches: with no entry there is no
    // permission to check, and inventing a default one would lock out routes
    // nobody has classified yet. The session requirement above is the floor.
    if (protectedRoute && user) {
        const isResidentUser = profile?.resident_id != null;
        const hasAdminRole = isAdminRole(role);

        if (pathname.startsWith('/portal')) {
            const isImpersonationRequest = request.nextUrl.searchParams.has('impersonate');
            if (!isResidentUser && !isImpersonationRequest) {
                return NextResponse.redirect(new URL('/dashboard', publicOrigin));
            }
            return response;
        }

        if (isResidentUser && !hasAdminRole && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
            return NextResponse.redirect(new URL('/portal', publicOrigin));
        }

        const requiredPermissions = routePermissionConfig[protectedRoute];
        if (requiredPermissions.length > 0) {
            if (!profile?.role_id) {
                const redirectUrl = new URL('/dashboard', publicOrigin);
                redirectUrl.searchParams.set('error', 'unauthorized');
                return NextResponse.redirect(redirectUrl);
            }

            const access = await resolveAccess(toAccessClient(supabase), { userId: user.id });
            if (access.status === 'lookup-failed') {
                console.error('[middleware] access lookup failed', { userId: user.id, error: access.error });
            }
            const userPermissions = access.status === 'resolved' ? access.permissions : [];

            const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

            if (!hasPermission) {
                const redirectUrl = new URL('/dashboard', publicOrigin);
                redirectUrl.searchParams.set('error', 'unauthorized');
                return NextResponse.redirect(redirectUrl);
            }
        }
    }

    // Already signed in and hitting /login — send them where they belong.
    // Non-active accounts must not be bounced to the dashboard; the approval
    // gate above deliberately exempts /login so this is the branch that decides.
    if (pathname === '/login' && user && profile) {
        if (profile.approval_status !== 'active') {
            return NextResponse.redirect(new URL('/pending-approval', publicOrigin));
        }

        const isResident = profile.resident_id != null;
        const redirectPath = isAdminRole(role)
            ? '/dashboard'
            : isResident
                ? '/portal'
                : '/pending-approval';
        return NextResponse.redirect(new URL(redirectPath, publicOrigin));
    }

    if (opsStatus) {
        const encoded = encodeOpsStatus(opsStatus);
        if (request.cookies.get(OPS_STATUS_COOKIE)?.value !== encoded) {
            // Readable by the page on purpose: it only decides what the banner shows.
            response.cookies.set({ name: OPS_STATUS_COOKIE, value: encoded, path: '/', sameSite: 'lax' });
        }
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/v1).*)',
    ],
};
