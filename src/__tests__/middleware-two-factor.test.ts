import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signTwoFactorMarker, TWO_FACTOR_COOKIE } from '@/lib/auth/two-factor-marker';

/**
 * Middleware second-factor gate (#455). Calls the real middleware() with a
 * mocked Supabase client. Enrolled users (two_factor_enabled) are bounced to
 * /auth/verify-2fa until a signed marker for their user + session is present.
 */

const USER = { id: 'user-1' };
const SESSION_ID = 'session-1';

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as Record<string, unknown> | null,
  sessionId: 'session-1' as string | null,
  profileError: null as { code: string; message: string } | null,
}));

function fakeJwt(sessionId: string | null) {
  const payload = Buffer.from(JSON.stringify(sessionId ? { session_id: sessionId } : {})).toString('base64url');
  return `h.${payload}.s`;
}

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => {
    const makeBuilder = (table: string) => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        single: async () =>
          table === 'profiles'
            ? { data: state.profileError ? null : state.profile, error: state.profileError }
            : { data: null, error: null },
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return builder;
    };
    return {
      auth: {
        getUser: async () => ({ data: { user: state.user }, error: null }),
        getSession: async () => ({
          data: { session: state.user ? { access_token: fakeJwt(state.sessionId) } : null },
        }),
        signOut: async () => ({ error: null }),
      },
      from: (table: string) => makeBuilder(table),
    };
  },
}));

const { middleware, isTwoFactorExemptPath } = await import('@/middleware');

const activeProfile = (extra: Record<string, unknown> = {}) => ({
  role_id: 'role-1',
  resident_id: null,
  approval_status: 'active',
  app_roles: { name: 'super_admin', category: 'admin' },
  ...extra,
});

function req(pathname: string, cookie?: string) {
  const headers = cookie ? { cookie: `${TWO_FACTOR_COOKIE}=${cookie}` } : undefined;
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), { headers });
}

function verifyRedirect(res: Response) {
  const loc = res.headers.get('location');
  return loc && new URL(loc).pathname === '/auth/verify-2fa' ? new URL(loc) : null;
}

beforeEach(() => {
  state.user = USER;
  state.sessionId = SESSION_ID;
  state.profile = activeProfile({ two_factor_enabled: true });
  state.profileError = null;
});

describe('middleware 2FA gate', () => {
  it('redirects an enrolled user without a marker to the verify page, keeping next', async () => {
    const res = await middleware(req('/residents'));
    const target = verifyRedirect(res);
    expect(res.status).toBe(307);
    expect(target?.searchParams.get('next')).toBe('/residents');
  });

  it('does not accept the legacy plain 2fa_verified=true cookie', async () => {
    const res = await middleware(
      new NextRequest(new URL('http://localhost:3000/residents'), {
        headers: { cookie: '2fa_verified=true' },
      })
    );
    expect(verifyRedirect(res)).not.toBeNull();
  });

  it('does not accept a plain "true" in the new cookie', async () => {
    expect(verifyRedirect(await middleware(req('/residents', 'true')))).not.toBeNull();
  });

  it('lets an enrolled user through with a valid marker', async () => {
    const marker = await signTwoFactorMarker({ userId: USER.id, sessionId: SESSION_ID });
    expect(verifyRedirect(await middleware(req('/residents', marker)))).toBeNull();
  });

  it('rejects a marker minted for another user', async () => {
    const marker = await signTwoFactorMarker({ userId: 'other-user', sessionId: SESSION_ID });
    expect(verifyRedirect(await middleware(req('/residents', marker)))).not.toBeNull();
  });

  it('rejects a marker from an earlier session', async () => {
    const marker = await signTwoFactorMarker({ userId: USER.id, sessionId: 'old-session' });
    expect(verifyRedirect(await middleware(req('/residents', marker)))).not.toBeNull();
  });

  it('rejects an expired marker', async () => {
    const marker = await signTwoFactorMarker({
      userId: USER.id,
      sessionId: SESSION_ID,
      nowSeconds: Math.floor(Date.now() / 1000) - 7200,
      ttlSeconds: 3600,
    });
    expect(verifyRedirect(await middleware(req('/residents', marker)))).not.toBeNull();
  });

  it('fails closed when the session carries no session id', async () => {
    const marker = await signTwoFactorMarker({ userId: USER.id, sessionId: SESSION_ID });
    state.sessionId = null;
    expect(verifyRedirect(await middleware(req('/residents', marker)))).not.toBeNull();
  });

  it('answers non-exempt /api requests from an unverified enrolled user with 403', async () => {
    const res = await middleware(req('/api/auth/gmail-callback'));
    expect(res.status).toBe(403);
  });

  it('serves the verify page, its API, and login to an unverified enrolled user', async () => {
    for (const path of ['/auth/verify-2fa', '/api/auth/2fa/verify', '/api/auth/2fa/send-code', '/auth/callback']) {
      const res = await middleware(req(path));
      expect(res.status, path).not.toBe(403);
      expect(verifyRedirect(res), path).toBeNull();
    }
  });

  it('leaves a non-enrolled user untouched', async () => {
    state.profile = activeProfile({ two_factor_enabled: false });
    expect(verifyRedirect(await middleware(req('/residents')))).toBeNull();
    state.profile = activeProfile();
    expect(verifyRedirect(await middleware(req('/residents')))).toBeNull();
  });

  it('does nothing extra for anonymous visitors (still the login redirect)', async () => {
    state.user = null;
    state.profile = null;
    const res = await middleware(req('/residents'));
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/login');
  });

  it('fails closed on a profile query ERROR: /api gets 403, pages go to login', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.profile = null;
    state.profileError = { code: '57014', message: 'statement timeout' };
    expect((await middleware(req('/api/payments/list'))).status).toBe(403);
    const page = await middleware(req('/residents'));
    const loc = new URL(page.headers.get('location') as string);
    expect(loc.pathname).toBe('/login');
    expect(loc.searchParams.get('error')).toBe('profile_unavailable');
    spy.mockRestore();
  });

  it('a profile query error does not trap the login page or the verify flow', async () => {
    state.profile = null;
    state.profileError = { code: '57014', message: 'statement timeout' };
    for (const path of ['/login', '/auth/verify-2fa', '/api/auth/2fa/verify']) {
      const res = await middleware(req(path));
      expect(res.status, path).not.toBe(403);
    }
  });

  it('keeps the existing behaviour for a genuinely missing profile (PGRST116)', async () => {
    state.profile = null;
    state.profileError = { code: 'PGRST116', message: 'no rows' };
    const res = await middleware(req('/residents'));
    expect(new URL(res.headers.get('location') as string).pathname).toBe('/pending-approval');
  });

  it('exempt paths match exact or on a segment boundary only', () => {
    for (const bad of ['/api/auth/2fa-evil', '/loginx', '/auth/verify-2fa.evil', '/login.evil', '/api/auth/2fax/verify', '/maintenance-x']) {
      expect(isTwoFactorExemptPath(bad), bad).toBe(false);
    }
    for (const good of ['/login', '/login/', '/auth/verify-2fa', '/api/auth/2fa/verify', '/auth/callback']) {
      expect(isTwoFactorExemptPath(good), good).toBe(true);
    }
  });

  it('an unverified enrolled user is not waved through a look-alike path', async () => {
    for (const bad of ['/loginx', '/api/auth/2fa-evil', '/auth/verify-2fa.evil']) {
      const res = await middleware(req(bad));
      expect(res.status, bad).not.toBe(200);
    }
  });

  it('exempt-path list is tight', () => {
    expect(isTwoFactorExemptPath('/auth/verify-2fa')).toBe(true);
    expect(isTwoFactorExemptPath('/dashboard')).toBe(false);
    expect(isTwoFactorExemptPath('/api/payments')).toBe(false);
    expect(isTwoFactorExemptPath('/portal')).toBe(false);
  });
});
