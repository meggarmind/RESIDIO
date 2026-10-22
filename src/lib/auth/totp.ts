/**
 * The one TOTP (authenticator app) checker (#972). Node runtime only.
 *
 * RFC 6238 with SHA-1, 6 digits and 30-second steps. A code is accepted for the current step and
 * one step either side, for clock drift. `matchTotpStep` returns the step that matched so a caller
 * can make a code single-use by refusing any step at or before the last one it accepted.
 */
import crypto from 'crypto';
import { safeEqual } from '@/lib/auth/two-factor-secrets';

export const TOTP_STEP_SECONDS = 30;

function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const paddedEncoded = encoded.toUpperCase().replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of paddedEncoded) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/** The 6-digit code for a base32 secret at one time step. */
export function generateTOTPCode(secret: string, timeCounter: number): string {
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeCounter));

  const hash = crypto.createHmac('sha1', base32Decode(secret)).update(timeBuffer).digest();

  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

export function totpStepAt(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** The time step `code` is valid for (current, previous or next), or null when it matches none. */
export function matchTotpStep(code: string, secret: string, nowMs: number = Date.now()): number | null {
  const current = totpStepAt(nowMs);
  for (let i = -1; i <= 1; i++) {
    if (safeEqual(generateTOTPCode(secret, current + i), code)) {
      return current + i;
    }
  }
  return null;
}

/** Validate a TOTP code against a secret. */
export function validateTOTP(code: string, secret: string): boolean {
  return matchTotpStep(code, secret) !== null;
}
