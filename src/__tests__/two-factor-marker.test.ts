import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSessionIdFromAccessToken,
  signTwoFactorMarker,
  verifyTwoFactorMarker,
} from '@/lib/auth/two-factor-marker';

/** Signed 2FA session marker (#455): tamper, wrong user/session, expiry, fail-closed. */

const USER = '11111111-1111-1111-1111-111111111111';
const SESSION = 'sess-aaaa';
const NOW = 1_800_000_000;

beforeEach(() => vi.stubEnv('DATA_ENCRYPTION_KEY', 'test-2fa-marker-key'));
afterEach(() => vi.unstubAllEnvs());

describe('2FA marker', () => {
  it('accepts a freshly signed marker for the same user and session', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW + 10 })).toBe(true);
  });

  it('rejects a marker for a different user', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    expect(await verifyTwoFactorMarker(m, { userId: 'someone-else', sessionId: SESSION, nowSeconds: NOW })).toBe(false);
  });

  it('rejects a marker from a different session (fresh sign-in invalidates it)', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: 'sess-bbbb', nowSeconds: NOW })).toBe(false);
  });

  it('rejects an expired marker', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW, ttlSeconds: 60 });
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW + 59 })).toBe(true);
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW + 60 })).toBe(false);
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW + 3600 })).toBe(false);
  });

  it('rejects a tampered payload (extended expiry) and a tampered signature', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW, ttlSeconds: 60 });
    const [body, sig] = m.split('.');
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    payload.e += 100000;
    const forgedBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
    expect(await verifyTwoFactorMarker(`${forgedBody}.${sig}`, { userId: USER, sessionId: SESSION, nowSeconds: NOW })).toBe(false);

    const flipped = sig.slice(0, -2) + (sig.endsWith('AA') ? 'BB' : 'AA');
    expect(await verifyTwoFactorMarker(`${body}.${flipped}`, { userId: USER, sessionId: SESSION, nowSeconds: NOW })).toBe(false);
  });

  it('rejects the legacy plain cookie value and garbage', async () => {
    for (const bad of ['true', '', undefined, null, 'a.b.c', '.', 'x.y']) {
      expect(await verifyTwoFactorMarker(bad as string, { userId: USER, sessionId: SESSION })).toBe(false);
    }
  });

  it('rejects when the session id is unknown (fail closed)', async () => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: null, nowSeconds: NOW })).toBe(false);
  });

  it('rejects a marker signed under a different secret', async () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'a'.repeat(64));
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    vi.stubEnv('DATA_ENCRYPTION_KEY', 'b'.repeat(64));
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW })).toBe(false);
  });

  it.each(['production', 'development', 'test'])('in %s with no secret: signing throws and verification fails closed', async (nodeEnv) => {
    const m = await signTwoFactorMarker({ userId: USER, sessionId: SESSION, nowSeconds: NOW });
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');
    vi.stubEnv('GMAIL_TOKEN_ENCRYPTION_KEY', '');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(signTwoFactorMarker({ userId: USER, sessionId: SESSION })).rejects.toThrow();
    expect(await verifyTwoFactorMarker(m, { userId: USER, sessionId: SESSION, nowSeconds: NOW })).toBe(false);
    spy.mockRestore();
  });

  it('reads session_id from an access token and tolerates junk', () => {
    const jwt = `h.${Buffer.from(JSON.stringify({ session_id: 'abc' })).toString('base64url')}.s`;
    expect(getSessionIdFromAccessToken(jwt)).toBe('abc');
    expect(getSessionIdFromAccessToken('nope')).toBeNull();
    expect(getSessionIdFromAccessToken(undefined)).toBeNull();
    expect(getSessionIdFromAccessToken(`h.${Buffer.from('{}').toString('base64url')}.s`)).toBeNull();
  });
});
