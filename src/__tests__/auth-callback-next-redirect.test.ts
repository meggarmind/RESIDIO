import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #418: the auth callback's `next=` parameter must never send a freshly
 * signed-in user to another host. `safeNextPath` is the guard; these tests
 * drive the real route through a successful code exchange so the `if (next)`
 * redirect is reached, then parse the Location the way a browser would
 * (WHATWG `new URL`, which treats `\` as `/`).
 */

const PUBLIC = 'https://stage.feyijimi.ng';
const PUBLIC_HOST = new URL(PUBLIC).host;
const BIND = 'http://0.0.0.0:3000';

vi.mock('@/lib/supabase/server', () => ({
    createServerSupabaseClient: async () => {
        const builder = {
            select: () => builder,
            eq: () => builder,
            single: async () => ({
                data: {
                    approval_status: 'approved',
                    resident_id: null,
                    app_roles: { name: 'super_admin', category: 'admin' },
                },
                error: null,
            }),
        };
        return {
            auth: {
                exchangeCodeForSession: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
                signOut: async () => ({ error: null }),
            },
            from: () => builder,
        };
    },
}));

const { GET } = await import('@/app/auth/callback/route');

/** `rawNext` is placed in the query string verbatim; URLSearchParams decodes it. */
async function callbackLocation(rawNext: string): Promise<URL> {
    const res = await GET(new Request(`${BIND}/auth/callback?code=abc&next=${rawNext}`));
    const location = res.headers.get('location');
    expect(location, `next=${rawNext} produced no redirect`).toBeTruthy();
    return new URL(location as string);
}

describe('auth callback next= open-redirect guard (#418)', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', PUBLIC);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it('honours a same-origin relative path', async () => {
        const target = await callbackLocation(encodeURIComponent('/residents'));
        expect(target.origin).toBe(PUBLIC);
        expect(target.pathname).toBe('/residents');
    });

    it('falls back to the role default when next is absent', async () => {
        const res = await GET(new Request(`${BIND}/auth/callback?code=abc`));
        const target = new URL(res.headers.get('location') as string);
        expect(target.host).toBe(PUBLIC_HOST);
        expect(target.pathname).toBe('/dashboard');
    });

    // Values safeNextPath must reject outright: the user lands on the role
    // default, on the public host.
    const rejected: Array<[label: string, rawNext: string]> = [
        ['//evil.com', encodeURIComponent('//evil.com')],
        ['https://evil.com', encodeURIComponent('https://evil.com')],
        ['javascript:alert(1)', encodeURIComponent('javascript:alert(1)')],
        ['raw %2F%2Fevil.com (decodes to //evil.com)', '%2F%2Fevil.com'],
        ['raw /%2F%2Fevil.com (decodes to ///evil.com)', '/%2F%2Fevil.com'],
        ['/\\evil.com', encodeURIComponent('/\\evil.com')],
        ['/\\/evil.com', encodeURIComponent('/\\/evil.com')],
        ['/\\\\/evil.com', encodeURIComponent('/\\\\/evil.com')],
    ];

    it.each(rejected)('rejects %s and redirects to the role default', async (_label, rawNext) => {
        const target = await callbackLocation(rawNext);
        expect(target.host).toBe(PUBLIC_HOST);
        expect(target.pathname).toBe('/dashboard');
    });

    // Values that must never leave the public host, however they are resolved.
    const hostile: Array<[label: string, rawNext: string]> = [
        ...rejected,
        ['encoded /%2F%2Fevil.com (literal percent-escapes)', encodeURIComponent('/%2F%2Fevil.com')],
    ];

    it.each(hostile)('keeps %s on the public host', async (_label, rawNext) => {
        const target = await callbackLocation(rawNext);
        expect(target.host).toBe(PUBLIC_HOST);
        expect(target.origin).toBe(PUBLIC);
    });
});
