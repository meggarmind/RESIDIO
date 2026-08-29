import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { ROUTE_PERMISSIONS, Permission, extractRoleName, isAdminRoleName } from '@/lib/auth/action-roles';
import type { ProfileApprovalStatus } from '@/types/database';

// Route protection configuration using new permission system
// Maps route prefixes to required permissions (empty array = any authenticated user)
const routePermissionConfig: Record<string, Permission[]> = {
    '/residents': [ROUTE_PERMISSIONS['/residents'][0]],
    '/houses': [ROUTE_PERMISSIONS['/houses'][0]],
    '/payments': [ROUTE_PERMISSIONS['/payments'][0]],
    '/payments/import': [ROUTE_PERMISSIONS['/payments/import'][0]],
    '/billing': [ROUTE_PERMISSIONS['/billing'][0]],
    '/security': [ROUTE_PERMISSIONS['/security'][0]],
    '/reports': ROUTE_PERMISSIONS['/reports'], // Any of these permissions
    '/approvals': [ROUTE_PERMISSIONS['/approvals'][0]],
    '/settings/roles': [ROUTE_PERMISSIONS['/settings/roles'][0]],
    '/settings/system': [ROUTE_PERMISSIONS['/settings/system'][0]],
    '/settings': [ROUTE_PERMISSIONS['/settings'][0]],
    '/dashboard': [], // All authenticated users
    '/portal': [], // Resident portal - requires resident_id (checked separately)
};

// Admin routes that residents should NOT access
const adminOnlyRoutes = [
    '/residents', '/houses', '/payments', '/billing', '/security',
    '/reports', '/approvals', '/settings', '/dashboard'
];

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

    // Check if route requires authentication
    const sortedRoutes = Object.keys(routePermissionConfig).sort((a, b) => b.length - a.length);
    const protectedRoute = sortedRoutes.find(route =>
        pathname.startsWith(route)
    );
    const isExemptRoute = maintenanceExemptRoutes.some(route => pathname.startsWith(route));

    // PERFORMANCE: getUser() first, then batch maintenance check and
    // profiles query into a single Promise.all round trip.
    let isMaintenanceMode = false;
    let profile: {
        role_id: string | null;
        resident_id: string | null;
        role: string | null;
        approval_status: ProfileApprovalStatus | null;
        app_roles?: unknown;
    } | null = null;

    const { data: userAuthData } = await supabase.auth.getUser();
    const user = userAuthData.user;

    if (user) {
        const [maintenanceData, profileData] = await Promise.all([
            !isExemptRoute
                ? supabase.from('system_settings').select('value').eq('key', 'maintenance_mode').single()
                : Promise.resolve({ data: null, error: null }),
            supabase
                .from('profiles')
                .select('role_id, resident_id, role, approval_status, app_roles!profiles_role_id_fkey (name)')
                .eq('id', user.id)
                .single(),
        ]);
        profile = profileData?.data || null;
        isMaintenanceMode = maintenanceData?.data?.value === true;
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
                const redirectUrl = new URL('/login', request.url);
                redirectUrl.searchParams.set('error', `account_${status}`);
                return NextResponse.redirect(redirectUrl);
            }
        } else if (status !== 'active'
            && !pathname.startsWith('/pending-approval')
            && !pathname.startsWith('/login')) {
            return NextResponse.redirect(new URL('/pending-approval', request.url));
        }
    }

    // Handle maintenance mode
    // The role name comes from the profiles join above, so no extra round trip.
    const roleName = profile ? extractRoleName(profile.app_roles) : null;

    if (!isExemptRoute && isMaintenanceMode) {
        if (roleName !== 'super_admin') {
            return NextResponse.redirect(new URL('/maintenance', request.url));
        }
    }

    if (protectedRoute) {
        if (!user) {
            const redirectUrl = new URL('/login', request.url);
            redirectUrl.searchParams.set('next', pathname);
            return NextResponse.redirect(redirectUrl);
        }

        const isResidentUser = profile?.resident_id != null;
        const hasAdminRole = isAdminRoleName(roleName);

        if (pathname.startsWith('/portal')) {
            const isImpersonationRequest = request.nextUrl.searchParams.has('impersonate');
            if (!isResidentUser && !isImpersonationRequest) {
                return NextResponse.redirect(new URL('/dashboard', request.url));
            }
            return response;
        }

        if (isResidentUser && !hasAdminRole && adminOnlyRoutes.some(route => pathname.startsWith(route))) {
            return NextResponse.redirect(new URL('/portal', request.url));
        }

        const requiredPermissions = routePermissionConfig[protectedRoute];
        if (requiredPermissions.length > 0) {
            if (!profile?.role_id) {
                const redirectUrl = new URL('/dashboard', request.url);
                redirectUrl.searchParams.set('error', 'unauthorized');
                return NextResponse.redirect(redirectUrl);
            }

            const { data: rolePerms } = await supabase
                .from('role_permissions')
                .select(`
          permission:app_permissions!inner(name)
        `)
                .eq('role_id', profile.role_id);

            const userPermissions = (rolePerms ?? [])
                .map((rp) => {
                    const perm = Array.isArray(rp.permission) ? rp.permission[0] : rp.permission;
                    return perm?.name;
                })
                .filter((name): name is string => name != null);

            const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

            if (!hasPermission) {
                const redirectUrl = new URL('/dashboard', request.url);
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
            return NextResponse.redirect(new URL('/pending-approval', request.url));
        }

        const isResident = profile.resident_id != null;
        const redirectPath = isAdminRoleName(roleName)
            ? '/dashboard'
            : isResident
                ? '/portal'
                : '/pending-approval';
        return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/v1).*)',
    ],
};
