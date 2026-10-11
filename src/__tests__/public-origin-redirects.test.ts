import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #417: server-built redirects must target the public origin, never the
 * 0.0.0.0:3000 bind address that request.url carries behind Traefik.
 */

const PUBLIC = 'https://stage.feyijimi.ng';
const BIND = 'http://0.0.0.0:3000';

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: {
            getUser: async () => ({ data: { user: null }, error: null }),
            signOut: async () => ({ error: null }),
        },
        from: () => {
            const builder = {
                select: () => builder,
                eq: () => builder,
                single: async () => ({ data: null, error: null }),
                then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
                    Promise.resolve({ data: [], error: null }).then(resolve),
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
const { middleware } = await import('@/middleware');

describe('public-origin redirects (#417)', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', PUBLIC);
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
});
