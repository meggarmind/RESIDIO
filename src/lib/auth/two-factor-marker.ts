/**
 * Signed "second factor completed" marker (#455).
 *
 * A password sign-in gives the browser a Supabase session, but for a user who
 * enrolled in 2FA that session is only half-authenticated. The marker is the
 * proof that the second factor was also completed in THIS session.
 *
 * Format: base64url(JSON {u, s, e}) "." base64url(HMAC-SHA256)
 *   u = user id, s = Supabase session id (JWT `session_id` claim), e = expiry (epoch s)
 *
 * Bound to the user AND the session, so it cannot be replayed onto another account
 * or survive a fresh sign-in. Uses Web Crypto only: this module runs in the Edge
 * middleware as well as in route handlers.
 *
 * Secret: DATA_ENCRYPTION_KEY, then GMAIL_TOKEN_ENCRYPTION_KEY (the same pair
 * src/lib/encryption.ts reads), domain-separated so the raw key is never used
 * as an HMAC key directly. There is no fallback secret in any environment: a
 * missing key THROWS, and every caller treats that as "not verified".
 */

export const TWO_FACTOR_COOKIE = 'residio_2fa';
export const TWO_FACTOR_MARKER_TTL_SECONDS = 60 * 60 * 24;

const DOMAIN = 'residio:2fa-marker:v1';

const encoder = new TextEncoder();

interface MarkerPayload {
    u: string;
    s: string;
    e: number;
}

function getSecret(): string {
    const key = process.env.DATA_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (key) return key;
    throw new Error(
        'DATA_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY) must be set to sign 2FA session markers.'
    );
}

async function hmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        encoder.encode(`${DOMAIN}:${getSecret()}`),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        [usage]
    );
}

function toBase64Url(bytes: Uint8Array): string {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
    if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
    try {
        const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
        const bin = atob(padded);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch {
        return null;
    }
}

/** Read the `session_id` claim from a Supabase access token. Not a signature check: the token already came from cookies the caller validated via getUser(). */
export function getSessionIdFromAccessToken(accessToken: string | null | undefined): string | null {
    if (!accessToken) return null;
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const bytes = fromBase64Url(part);
    if (!bytes) return null;
    try {
        const claims = JSON.parse(new TextDecoder().decode(bytes)) as { session_id?: unknown };
        return typeof claims.session_id === 'string' && claims.session_id ? claims.session_id : null;
    } catch {
        return null;
    }
}

export async function signTwoFactorMarker(args: {
    userId: string;
    sessionId: string;
    nowSeconds?: number;
    ttlSeconds?: number;
}): Promise<string> {
    const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
    const payload: MarkerPayload = {
        u: args.userId,
        s: args.sessionId,
        e: now + (args.ttlSeconds ?? TWO_FACTOR_MARKER_TTL_SECONDS),
    };
    const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
    const sig = await crypto.subtle.sign('HMAC', await hmacKey('sign'), encoder.encode(body));
    return `${body}.${toBase64Url(new Uint8Array(sig))}`;
}

/** Fails closed: any malformed, tampered, expired, mismatched or unverifiable marker returns false. */
export async function verifyTwoFactorMarker(
    marker: string | null | undefined,
    expected: { userId: string; sessionId: string | null | undefined; nowSeconds?: number }
): Promise<boolean> {
    try {
        if (!marker || !expected.userId || !expected.sessionId) return false;
        const [body, sig, extra] = marker.split('.');
        if (!body || !sig || extra !== undefined) return false;

        const sigBytes = fromBase64Url(sig);
        if (!sigBytes) return false;
        const ok = await crypto.subtle.verify(
            'HMAC',
            await hmacKey('verify'),
            sigBytes as BufferSource,
            encoder.encode(body)
        );
        if (!ok) return false;

        const payloadBytes = fromBase64Url(body);
        if (!payloadBytes) return false;
        const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as Partial<MarkerPayload>;
        const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);

        return (
            payload.u === expected.userId &&
            payload.s === expected.sessionId &&
            typeof payload.e === 'number' &&
            payload.e > now
        );
    } catch (error) {
        console.error('[2FA marker] verification failed closed:', error instanceof Error ? error.message : error);
        return false;
    }
}
