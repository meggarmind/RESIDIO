import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  encryptTotpSecret,
  generateOtp,
  hashBackupCode,
  readTotpSecret,
  verifyBackupCodeHash,
} from '@/lib/auth/two-factor-secrets';

/** TOTP secret encryption, OTP generation and backup-code hashing (#455). */

const PLAINTEXT_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'; // 32 chars, as setup.ts generates

beforeEach(() => vi.stubEnv('DATA_ENCRYPTION_KEY', 'c'.repeat(64)));
afterEach(() => vi.unstubAllEnvs());

describe('TOTP secret at rest', () => {
  it('round-trips and does not store the secret in the clear', () => {
    const stored = encryptTotpSecret(PLAINTEXT_SECRET);
    expect(stored).not.toContain(PLAINTEXT_SECRET);
    expect(stored).not.toBe(PLAINTEXT_SECRET);
    expect(readTotpSecret(stored)).toBe(PLAINTEXT_SECRET);
  });

  it('uses a fresh IV each time', () => {
    expect(encryptTotpSecret(PLAINTEXT_SECRET)).not.toBe(encryptTotpSecret(PLAINTEXT_SECRET));
  });

  it('still reads legacy plaintext rows', () => {
    expect(readTotpSecret(PLAINTEXT_SECRET)).toBe(PLAINTEXT_SECRET);
  });

  it('fails (throws) on tampered ciphertext rather than returning garbage', () => {
    const stored = Buffer.from(encryptTotpSecret(PLAINTEXT_SECRET), 'base64');
    stored[stored.length - 1] ^= 0xff;
    expect(() => readTotpSecret(stored.toString('base64'))).toThrow();
  });

  it('throws when encrypting without a key', () => {
    vi.stubEnv('DATA_ENCRYPTION_KEY', '');
    vi.stubEnv('GMAIL_TOKEN_ENCRYPTION_KEY', '');
    expect(() => encryptTotpSecret(PLAINTEXT_SECRET)).toThrow();
  });
});

describe('OTP generation', () => {
  it('is always six digits and uses crypto.randomInt, not Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^[1-9][0-9]{5}$/);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('delegates to crypto.randomInt over the 6-digit range', () => {
    const spy = vi.spyOn(crypto, 'randomInt').mockReturnValue(123456 as never);
    expect(generateOtp()).toBe('123456');
    expect(spy).toHaveBeenCalledWith(100000, 1000000);
    spy.mockRestore();
  });
});

describe('backup code hashing', () => {
  it('new hashes are salted: same code, different hash, both verify', () => {
    const a = hashBackupCode('ABCD1234');
    const b = hashBackupCode('ABCD1234');
    expect(a).not.toBe(b);
    expect(a.startsWith('v2$')).toBe(true);
    expect(verifyBackupCodeHash('ABCD1234', a)).toBe(true);
    expect(verifyBackupCodeHash('abcd1234', b)).toBe(true);
    expect(verifyBackupCodeHash('ABCD1235', a)).toBe(false);
  });

  it('still verifies legacy unsalted SHA-256 hashes', () => {
    const legacy = crypto.createHash('sha256').update('ABCD1234').digest('hex');
    expect(verifyBackupCodeHash('ABCD1234', legacy)).toBe(true);
    expect(verifyBackupCodeHash('abcd1234', legacy)).toBe(true);
    expect(verifyBackupCodeHash('ZZZZ9999', legacy)).toBe(false);
  });

  it('rejects malformed v2 values', () => {
    expect(verifyBackupCodeHash('ABCD1234', 'v2$')).toBe(false);
    expect(verifyBackupCodeHash('ABCD1234', 'v2$zz')).toBe(false);
  });
});
