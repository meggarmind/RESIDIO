/**
 * Issue #997 -- the Gmail connect flow binds its OAuth `state` to the admin who started
 * it. getGmailAuthUrl stores `<userId>.<state>` in an httpOnly cookie; the callback's
 * exchangeGmailCode accepts a code only when the returned state matches that cookie for
 * the signed-in admin, and clears the cookie so a state works once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeRecordingSupabase, uid, type QueryResult } from '@/__tests__/helpers/recording-supabase';
import {
  createGmailOAuthState,
  verifyGmailOAuthState,
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_OAUTH_STATE_COOKIE_PATH,
} from '@/lib/email-imports/gmail-client';
import { getGmailAuthUrl, exchangeGmailCode } from '@/actions/email-imports/gmail-oauth';

const { authorizePermission, jar, exchangeAuthCode, results, calls } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  jar: new Map<string, { value: string; options?: Record<string, unknown> }>(),
  exchangeAuthCode: vi.fn(),
  results: {} as Record<string, QueryResult>,
  calls: [] as string[],
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => makeRecordingSupabase({ results, calls }),
  createAdminClient: async () => makeRecordingSupabase({ results, calls }),
}));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => jar.set(name, { value, options }),
    delete: (arg: string | { name: string }) => jar.delete(typeof arg === 'string' ? arg : arg.name),
  }),
}));
vi.mock('@/lib/email-imports/gmail-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/email-imports/gmail-client')>()),
  getGmailAuthUrl: (state: string) => `https://accounts.example.test/auth?state=${state}`,
  exchangeAuthCode,
}));
vi.mock('@/lib/email-imports/oauth-encryption', () => ({ encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v }));
vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: class { setCredentials() {} } },
    oauth2: () => ({ userinfo: { get: async () => ({ data: { email: 'estate@example.test' } }) } }),
  },
}));

const ADMIN = uid(1);
const OTHER_ADMIN = uid(2);

function signInAs(userId: string) {
  authorizePermission.mockResolvedValue({ authorized: true, userId, roleName: 'super_admin' });
}

async function startConnect(): Promise<string> {
  const result = await getGmailAuthUrl();
  expect(result.error).toBeNull();
  const state = new URL(result.data!.url).searchParams.get('state');
  expect(state).toBeTruthy();
  return state!;
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  calls.length = 0;
  for (const k of Object.keys(results)) delete results[k];
  results['gmail_oauth_credentials.insert'] = { data: { id: uid(9) } };
  exchangeAuthCode.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiry: new Date() });
  signInAs(ADMIN);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('verifyGmailOAuthState', () => {
  it('accepts only the matching state for the same user', () => {
    const { state, cookieValue } = createGmailOAuthState(ADMIN);
    expect(verifyGmailOAuthState(state, cookieValue, ADMIN)).toBe(true);
    expect(verifyGmailOAuthState(state, cookieValue, OTHER_ADMIN)).toBe(false);
    expect(verifyGmailOAuthState(createGmailOAuthState(ADMIN).state, cookieValue, ADMIN)).toBe(false);
    expect(verifyGmailOAuthState(null, cookieValue, ADMIN)).toBe(false);
    expect(verifyGmailOAuthState(state, undefined, ADMIN)).toBe(false);
    expect(verifyGmailOAuthState(state, cookieValue, null)).toBe(false);
    expect(verifyGmailOAuthState('', `${ADMIN}.`, ADMIN)).toBe(false);
  });

  it('issues a fresh unguessable state each time', () => {
    expect(createGmailOAuthState(ADMIN).state).not.toBe(createGmailOAuthState(ADMIN).state);
    expect(createGmailOAuthState(ADMIN).state.length).toBeGreaterThanOrEqual(32);
  });
});

describe('getGmailAuthUrl', () => {
  it('puts the state in the URL and an httpOnly cookie scoped to the callback', async () => {
    const state = await startConnect();
    const cookie = jar.get(GMAIL_OAUTH_STATE_COOKIE)!;
    expect(cookie.value).toBe(`${ADMIN}.${state}`);
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: GMAIL_OAUTH_STATE_COOKIE_PATH });
  });

  it('sets no cookie when the caller is not authorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, userId: null, error: 'Unauthorized' });
    expect((await getGmailAuthUrl()).error).toBe('Unauthorized');
    expect(jar.size).toBe(0);
  });
});

describe('exchangeGmailCode', () => {
  it('connects when the admin who started the flow returns with its state', async () => {
    const state = await startConnect();
    const result = await exchangeGmailCode('code', state);
    expect(result).toEqual({ data: { email: 'estate@example.test' }, error: null });
    expect(calls).toContain('write:gmail_oauth_credentials.insert');
    expect(jar.has(GMAIL_OAUTH_STATE_COOKIE)).toBe(false);
  });

  it('rejects a reused state', async () => {
    const state = await startConnect();
    expect((await exchangeGmailCode('code', state)).error).toBeNull();
    calls.length = 0;
    expect((await exchangeGmailCode('code', state)).error).toMatch(/could not be verified/);
    expect(calls).toEqual([]);
  });

  it('rejects a callback with no connect request started in this browser', async () => {
    const { state } = createGmailOAuthState(ADMIN);
    expect((await exchangeGmailCode('code', state)).error).toMatch(/could not be verified/);
    expect(exchangeAuthCode).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('rejects a state from a different connect request, and consumes the pending one', async () => {
    await startConnect();
    const foreign = createGmailOAuthState(ADMIN).state;
    expect((await exchangeGmailCode('code', foreign)).error).toMatch(/could not be verified/);
    expect(exchangeAuthCode).not.toHaveBeenCalled();
    expect(jar.has(GMAIL_OAUTH_STATE_COOKIE)).toBe(false);
  });

  it('rejects a missing state', async () => {
    await startConnect();
    expect((await exchangeGmailCode('code', null)).error).toMatch(/could not be verified/);
    expect(exchangeAuthCode).not.toHaveBeenCalled();
  });

  it('rejects when a different admin completes the flow', async () => {
    const state = await startConnect();
    signInAs(OTHER_ADMIN);
    expect((await exchangeGmailCode('code', state)).error).toMatch(/could not be verified/);
    expect(exchangeAuthCode).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
