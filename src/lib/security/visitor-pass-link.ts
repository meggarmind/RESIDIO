/**
 * Signed links for the visitor-pass image (/api/og/visitor-pass, #1063).
 *
 * The image draws the name, code, validity and estate from the query string, so
 * an unsigned route would print a convincing pass for anything. The link
 * carries an HMAC-SHA256 over those four values; the route refuses any link
 * whose signature does not match. Visitors need no sign-in: the link is enough.
 *
 * Secret: DATA_ENCRYPTION_KEY, then GMAIL_TOKEN_ENCRYPTION_KEY, domain-separated
 * (as in two-factor-marker.ts). No fallback: a missing key throws. Web Crypto
 * only, because the route runs on the Edge runtime.
 */

export interface VisitorPassFields {
    visitorName: string;
    code: string;
    valid: string;
    estate: string;
}

const DOMAIN = 'residio:visitor-pass:v1';
const encoder = new TextEncoder();

function getSecret(): string {
    const key = process.env.DATA_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (key) return key;
    throw new Error('DATA_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY) must be set to sign visitor-pass links.');
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

function payload(fields: VisitorPassFields): Uint8Array {
    return encoder.encode(JSON.stringify([fields.visitorName, fields.code, fields.valid, fields.estate]));
}

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Query string (without `?`) for a signed visitor-pass image link. */
export async function buildSignedVisitorPassQuery(fields: VisitorPassFields): Promise<string> {
    const sig = await crypto.subtle.sign('HMAC', await hmacKey('sign'), payload(fields) as BufferSource);
    return new URLSearchParams({
        visitorName: fields.visitorName,
        code: fields.code,
        valid: fields.valid,
        estate: fields.estate,
        sig: toHex(new Uint8Array(sig)),
    }).toString();
}

/** Reads and verifies a link's fields. Fails closed: returns null for any missing, tampered or unverifiable link. */
export async function readSignedVisitorPass(searchParams: URLSearchParams): Promise<VisitorPassFields | null> {
    try {
        const sig = searchParams.get('sig') ?? '';
        if (!/^[a-f0-9]{64}$/.test(sig)) return null;
        const fields: VisitorPassFields = {
            visitorName: searchParams.get('visitorName') ?? '',
            code: searchParams.get('code') ?? '',
            valid: searchParams.get('valid') ?? '',
            estate: searchParams.get('estate') ?? '',
        };
        const sigBytes = new Uint8Array(sig.match(/../g)!.map((h) => parseInt(h, 16)));
        const ok = await crypto.subtle.verify('HMAC', await hmacKey('verify'), sigBytes as BufferSource, payload(fields) as BufferSource);
        return ok ? fields : null;
    } catch (error) {
        console.error('[visitor pass] link verification failed closed:', error instanceof Error ? error.message : error);
        return null;
    }
}
