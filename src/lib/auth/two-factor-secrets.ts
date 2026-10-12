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
