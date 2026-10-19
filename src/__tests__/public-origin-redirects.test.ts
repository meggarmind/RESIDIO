import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #417: server-built redirects must target the public origin, never the
 * 0.0.0.0:3000 bind address that request.url carries behind Traefik.
 */

const PUBLIC = 'https://stage.feyijimi.ng';
const BIND = 'http://0.0.0.0:3000';

const state = vi.hoisted(() => ({
    user: null as { id: string } | null,
    profile: null as Record<string, unknown> | null,
    maintenance: false,
    accessRows: [] as { role_id: string; role_name: string; permission_name: string | null }[],
}));

const exchangeGmailCode = vi.hoisted(() => vi.fn());

vi.mock('@/actions/email-imports/gmail-oauth', () => ({ exchangeGmailCode }));

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: {
            getUser: async () => ({ data: { user: state.user }, error: null }),
            signOut: async () => ({ error: null }),
        },
        // Permission lookups go through get_my_access() (#535).
        rpc: async () => ({ data: state.accessRows, error: null }),
        from: (table: string) => {
            const builder = {
                select: () => builder,
                eq: () => builder,
                in: async () => ({ data: [{ key: 'maintenance_mode', value: state.maintenance }], error: null }),
                single: async () =>
                    table === 'profiles'
                        ? { data: state.profile, error: null }
                        : { data: null, error: null },
            };
            return builder;
        },
    }),
}));

vi.mock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: async () => {
        throw new Error('supabase must not be reached on these branches');
    },
}));

const { GET } = await import('@/app/auth/callback/route');
const { GET: gmailGET } = await import('@/app/api/auth/gmail-callback/route');
const { middleware } = await import('@/middleware');

describe('public-origin redirects (#417)', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', PUBLIC);
        state.user = null;
        state.profile = null;
        state.maintenance = false;
        // Default: a role that holds no permissions (single null row).
        state.accessRows = [{ role_id: 'role-1', role_name: 'super_admin', permission_name: null }];
        exchangeGmailCode.mockReset();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('auth callback provider-error redirect uses the public origin', async () => {
        const res = await GET(new Request(`${BIND}/auth/callback?error=access_denied`));
        const location = res.headers.get('location') ?? '';
        expect(location.startsWith(`${PUBLIC}/login`)).toBe(true);
        expect(location).toContain('error=oauth_cancelled');
        expect(location).not.toContain('0.0.0.0');
    });

    it('auth callback no-code redirect uses the public origin', async () => {
        const res = await GET(new Request(`${BIND}/auth/callback`));
        expect(res.headers.get('location')).toBe(`${PUBLIC}/login`);
    });

    it('auth callback honours forwarded headers when no site URL is configured', async () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
        const res = await GET(
            new Request(`${BIND}/auth/callback`, {
                headers: { 'x-forwarded-host': 'stage.feyijimi.ng', 'x-forwarded-proto': 'https' },
            }),
        );
        expect(res.headers.get('location')).toBe(`${PUBLIC}/login`);
    });

    it('middleware login redirect uses the public origin and keeps ?next=', async () => {
        const res = await middleware(new NextRequest(new URL(`${BIND}/residents`)));
        const location = res.headers.get('location') ?? '';
        const target = new URL(location);
        expect(target.origin).toBe(PUBLIC);
        expect(target.pathname).toBe('/login');
        expect(target.searchParams.get('next')).toBe('/residents');
    });

    describe('gmail callback', () => {
        const gmailUrl = `${BIND}/api/auth/gmail-callback`;

        it('success redirect uses the public origin', async () => {
            exchangeGmailCode.mockResolvedValue({ data: { email: 'a@b.co' }, error: null });
            const res = await gmailGET(new Request(`${gmailUrl}?code=x`));
            const location = res.headers.get('location') ?? '';
            expect(location.startsWith(`${PUBLIC}/settings/email-integration`)).toBe(true);
            expect(location).not.toContain('0.0.0.0');
        });

        it('exchange-error redirect uses the public origin', async () => {
            exchangeGmailCode.mockResolvedValue({ data: null, error: 'boom' });
            const res = await gmailGET(new Request(`${gmailUrl}?code=x`));
            expect(res.headers.get('location')?.startsWith(`${PUBLIC}/settings/email-integration`)).toBe(true);
        });

        it('denied-access redirect uses the public origin', async () => {
            const res = await gmailGET(new Request(`${gmailUrl}?error=access_denied`));
            expect(res.headers.get('location')?.startsWith(`${PUBLIC}/settings/email-integration`)).toBe(true);
        });

        it('missing-code redirect uses the public origin', async () => {
            const res = await gmailGET(new Request(gmailUrl));
            expect(res.headers.get('location')?.startsWith(`${PUBLIC}/settings/email-integration`)).toBe(true);
        });
    });

    describe('middleware redirect branches', () => {
        const admin = {
            role_id: 'role-1',
            resident_id: null,
            approval_status: 'active',
            app_roles: { name: 'super_admin', category: 'admin' },
        };

        async function run(pathname: string) {
            const res = await middleware(new NextRequest(new URL(`${BIND}${pathname}`)));
            const location = res.headers.get('location');
            expect(location, `${pathname} produced no redirect`).toBeTruthy();
            expect(location).not.toContain('0.0.0.0');
            return new URL(location as string);
        }

        beforeEach(() => {
            state.user = { id: 'user-1' };
            state.profile = { ...admin };
        });

        it('non-resident on /portal is sent to /dashboard', async () => {
            const target = await run('/portal');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/dashboard');
        });

        it('profile without a role is sent to /dashboard?error=unauthorized', async () => {
            state.profile = { ...admin, role_id: null };
            const target = await run('/residents');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/dashboard');
            expect(target.searchParams.get('error')).toBe('unauthorized');
        });

        it('missing permission is sent to /dashboard?error=unauthorized', async () => {
            state.accessRows = [{ role_id: 'role-1', role_name: 'super_admin', permission_name: null }];
            const target = await run('/residents');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/dashboard');
            expect(target.searchParams.get('error')).toBe('unauthorized');
        });

        it('active admin on /login is sent to /dashboard', async () => {
            const target = await run('/login');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/dashboard');
        });

        it('active resident on /login is sent to /portal', async () => {
            state.profile = {
                role_id: 'role-2',
                resident_id: 'res-1',
                approval_status: 'active',
                app_roles: { name: 'resident', category: 'resident' },
            };
            const target = await run('/login');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/portal');
        });

        it('resident on an admin-only route is sent to /portal', async () => {
            state.profile = {
                role_id: 'role-2',
                resident_id: 'res-1',
                approval_status: 'active',
                app_roles: { name: 'resident', category: 'resident' },
            };
            const target = await run('/residents');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/portal');
        });

        it('non-active account on /login is sent to /pending-approval', async () => {
            state.profile = { ...admin, approval_status: 'pending' };
            const target = await run('/login');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/pending-approval');
        });

        it('pending account elsewhere is sent to /pending-approval', async () => {
            state.profile = { ...admin, approval_status: 'pending' };
            const target = await run('/dashboard');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/pending-approval');
        });

        it('suspended account is sent to /login?error=account_suspended', async () => {
            state.profile = { ...admin, approval_status: 'suspended' };
            const target = await run('/dashboard');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/login');
            expect(target.searchParams.get('error')).toBe('account_suspended');
        });

        it('maintenance mode sends a non-super-admin to /maintenance', async () => {
            state.maintenance = true;
            state.profile = { ...admin, app_roles: { name: 'chairman', category: 'admin' } };
            const target = await run('/dashboard');
            expect(target.origin).toBe(PUBLIC);
            expect(target.pathname).toBe('/maintenance');
        });
    });
});
