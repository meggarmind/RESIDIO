import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfig } from '@/lib/supabase/config';
import { ROUTE_PERMISSIONS, Permission } from '@/lib/auth/action-roles';

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
const maintenanceExemptRoutes = ['/login', '/maintenance', '/api'];

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

    const { data: { user } } = await supabase.auth.getUser();
    const pathname = request.nextUrl.pathname;

    // Check if route requires authentication
    const sortedRoutes = Object.keys(routePermissionConfig).sort((a, b) => b.length - a.length);
    const protectedRoute = sortedRoutes.find(route =>
        pathname.startsWith(route)
    );
    const isExemptRoute = maintenanceExemptRoutes.some(route => pathname.startsWith(route));

    // PERFORMANCE OPTIMIZATION: Fetch profile + maintenance setting in parallel
    let profile: { role_id: string | null; resident_id: string | null; role: string | null } | null = null;
    let isMaintenanceMode = false;

    if (user) {
        const [profileResult, maintenanceResult] = await Promise.all([
            supabase
                .from('profiles')
                .select('role_id, resident_id, role')
                .eq('id', user.id)
                .single(),
            isExemptRoute
                ? Promise.resolve({ data: null })
                : supabase
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'maintenance_mode')
                    .single(),
        ]);

        profile = profileResult.data;
        isMaintenanceMode = maintenanceResult.data?.value === true;
    } else if (!isExemptRoute) {
        const { data: maintenanceSetting } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'maintenance_mode')
            .single();

        isMaintenanceMode = maintenanceSetting?.value === true;
    }

    // Handle maintenance mode
    if (!isExemptRoute && isMaintenanceMode) {
        if (user && profile?.role_id) {
            const { data: roleData } = await supabase
                .from('app_roles')
                .select('name')
                .eq('id', profile.role_id)
                .single();

            const isSuperAdmin = roleData?.name === 'super_admin';
            if (!isSuperAdmin) {
                return NextResponse.redirect(new URL('/maintenance', request.url));
            }
        } else {
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
        const hasAdminRole = profile?.role_id != null;

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

            const userPermissions = (rolePerms as any[] ?? [])
                .map((rp) => (rp.permission as any)?.name)
                .filter((name): name is string => name != null);

            const hasPermission = requiredPermissions.some(p => userPermissions.includes(p));

            if (!hasPermission) {
                const redirectUrl = new URL('/dashboard', request.url);
                redirectUrl.searchParams.set('error', 'unauthorized');
                return NextResponse.redirect(redirectUrl);
            }
        }
    }

    if (pathname === '/login' && user && profile) {
        const hasAdminRole = profile.role_id != null;
        const isResident = profile.resident_id != null;
        const redirectPath = (hasAdminRole || !isResident) ? '/dashboard' : '/portal';
        return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/v1).*)',
    ],
};
