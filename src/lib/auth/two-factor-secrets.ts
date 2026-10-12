/**
 * Server-side helpers for 2FA secrets and codes (#455). Node runtime only.
 */
import crypto from 'crypto';
import { encrypt, decrypt } from '@/lib/encryption';

/** Uniformly random 6-digit OTP from a CSPRNG (Math.random is predictable). */
export function generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
}

/** Constant-time string compare. */
export function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Unencrypted TOTP secrets are 20 random bytes in base32: 32 chars, A-Z2-7. AES-GCM blobs are at least 40 base64 chars. */
const PLAINTEXT_TOTP = /^[A-Z2-7]{16,32}=*$/;

export function encryptTotpSecret(secret: string): string {
    return encrypt(secret);
}

/** Returns the base32 secret, accepting legacy plaintext rows. Throws if an encrypted value cannot be decrypted. */
export function readTotpSecret(stored: string): string {
    if (PLAINTEXT_TOTP.test(stored)) return stored;
    return decrypt(stored);
}

const BACKUP_PREFIX = 'v2$';

/** Salted scrypt hash for NEW backup codes: `v2$<salt hex>$<hash hex>`. */
export function hashBackupCode(code: string): string {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(code.toUpperCase(), salt, 32);
    return `${BACKUP_PREFIX}${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** True for a legacy unencrypted base32 secret (candidate for lazy re-encryption). */
export function isPlaintextTotpSecret(stored: string): boolean {
    return PLAINTEXT_TOTP.test(stored);
}

const OTP_PREFIX = 'h1$';
const DEV_OTP_SECRET = 'residio-dev-only-2fa-otp-secret-not-for-production';

function otpKey(): string {
    const key = process.env.DATA_ENCRYPTION_KEY || process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
    if (key) return key;
    if (process.env.NODE_ENV === 'production') {
        throw new Error('DATA_ENCRYPTION_KEY (or GMAIL_TOKEN_ENCRYPTION_KEY) must be set to hash 2FA codes.');
    }
    return DEV_OTP_SECRET;
}

/**
 * Value to store in two_factor_tokens.token: `h1$` + HMAC-SHA256(server key, profile id + code).
 * Needs the column widened to TEXT (migration 20261012210000). A DB-read leak then no
 * longer yields usable codes, and a hash cannot be replayed across profiles.
 */
export function hashOtp(profileId: string, code: string): string {
    const mac = crypto
        .createHmac('sha256', `residio:2fa-otp:v1:${otpKey()}`)
        .update(`${profileId}:${code}`)
        .digest('hex');
    return `${OTP_PREFIX}${mac}`;
}

/** Compare a submitted code with a stored token. Accepts hashed tokens and legacy plaintext ones (until they expire). */
export function otpMatches(stored: string, profileId: string, code: string): boolean {
    if (typeof stored !== 'string' || typeof code !== 'string') return false;
    if (stored.startsWith(OTP_PREFIX)) return safeEqual(stored, hashOtp(profileId, code));
    return safeEqual(stored.trim(), code);
}

/** Verifies a salted (v2) hash or a legacy unsalted SHA-256 hex hash. */
export function verifyBackupCodeHash(code: string, stored: string): boolean {
    const normalised = code.toUpperCase();
    if (stored.startsWith(BACKUP_PREFIX)) {
        const [, saltHex, hashHex] = stored.split('$');
        if (!saltHex || !hashHex) return false;
        const actual = crypto.scryptSync(normalised, Buffer.from(saltHex, 'hex'), 32).toString('hex');
        return safeEqual(actual, hashHex);
    }
    return safeEqual(crypto.createHash('sha256').update(normalised).digest('hex'), stored);
}
