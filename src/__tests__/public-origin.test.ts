import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPublicOrigin } from '@/lib/http/public-origin';

/**
 * #417: behind Traefik the standalone server binds 0.0.0.0:3000, so request.url
 * carries the bind address. Redirects must be built from the public origin.
 */

const BIND_URL = 'http://0.0.0.0:3000/auth/callback';
const req = (headers: Record<string, string> = {}, url = BIND_URL) =>
    new Request(url, { headers });

describe('getPublicOrigin', () => {
    beforeEach(() => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    });
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('prefers NEXT_PUBLIC_SITE_URL over every header, without a trailing slash', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://stage.feyijimi.ng/');
        const origin = getPublicOrigin(
            req({ 'x-forwarded-host': 'other.example', host: 'third.example' }),
        );
        expect(origin).toBe('https://stage.feyijimi.ng');
    });

    it('reads the env var at call time, not module load', () => {
        expect(getPublicOrigin(req())).toBe('http://0.0.0.0:3000');
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://late.example');
        expect(getPublicOrigin(req())).toBe('https://late.example');
    });

    it('falls through an invalid env value', () => {
        for (const bad of ['not a url', 'ftp://files.example', 'javascript:alert(1)']) {
            vi.stubEnv('NEXT_PUBLIC_SITE_URL', bad);
            expect(getPublicOrigin(req({ 'x-forwarded-host': 'fwd.example' }))).toBe(
                'https://fwd.example',
            );
        }
    });

    it('uses x-forwarded-host with x-forwarded-proto next', () => {
        expect(
            getPublicOrigin(req({ 'x-forwarded-host': 'fwd.example', 'x-forwarded-proto': 'http' })),
        ).toBe('http://fwd.example');
    });

    it('prefers x-forwarded-host over the host header when both are set', () => {
        expect(
            getPublicOrigin(req({ 'x-forwarded-host': 'fwd.example', host: 'host.example' })),
        ).toBe('https://fwd.example');
    });

    it('defaults forwarded proto to https and takes the first comma-separated value', () => {
        expect(
            getPublicOrigin(
                req({ 'x-forwarded-host': 'a.example, b.example', 'x-forwarded-proto': 'https, http' }),
            ),
        ).toBe('https://a.example');
        expect(getPublicOrigin(req({ 'x-forwarded-host': 'a.example' }))).toBe('https://a.example');
    });

    it('uses the host header with the request URL protocol when nothing is forwarded', () => {
        expect(getPublicOrigin(req({ host: 'host.example' }))).toBe('http://host.example');
        expect(
            getPublicOrigin(req({ host: 'host.example' }, 'https://0.0.0.0:3000/x')),
        ).toBe('https://host.example');
    });

    it('falls back to the request URL origin', () => {
        expect(getPublicOrigin(req())).toBe('http://0.0.0.0:3000');
    });

    it('ignores a forwarded host that is not a bare authority (no path or userinfo injection)', () => {
        expect(getPublicOrigin(req({ 'x-forwarded-host': 'evil.example/path' }))).toBe(
            'http://0.0.0.0:3000',
        );
        expect(getPublicOrigin(req({ 'x-forwarded-host': 'user@evil.example' }))).toBe(
            'http://0.0.0.0:3000',
        );
    });
});
