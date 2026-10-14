import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Issue #563: regenerateBackupCodes() replaced a user's 2FA backup codes with only a live
 * session, no TOTP/OTP re-verification and no logAudit. It had no callers and was removed.
 * generateBackupCodes(verificationCode) is the only path that may replace backup codes.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const backupCodesSrc = read('../actions/two-factor/backup-codes.ts');
const indexSrc = read('../actions/two-factor/index.ts');
const hookSrc = read('../hooks/use-two-factor.ts');

/** Extract the source of an exported function by name (up to the next top-level declaration). */
function functionBody(src: string, name: string): string {
  const start = src.search(new RegExp(`export async function ${name}\\b`));
  expect(start, `${name} should exist`).toBeGreaterThanOrEqual(0);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(?:export |async function |function |\/\*\*)/);
  return rest.slice(0, next === -1 ? undefined : next);
}

describe('unverified backup-code regeneration is gone (#563)', () => {
  it('backup-codes.ts exports no regenerate function', () => {
    expect(backupCodesSrc).not.toMatch(/regenerateBackupCodes/);
    expect(backupCodesSrc).not.toMatch(/export\s+async\s+function\s+regenerate\w*/i);
  });

  it('two-factor/index.ts does not re-export it', () => {
    expect(indexSrc).not.toMatch(/regenerateBackupCodes/);
  });

  it('no hook wraps it', () => {
    expect(hookSrc).not.toMatch(/regenerateBackupCodes|useRegenerateBackupCodes/);
  });

  it('every exported function that stores new backup codes takes a verification code', () => {
    const exported = [...backupCodesSrc.matchAll(/export async function (\w+)\s*\(([^)]*)\)/g)];
    const writers = exported.filter(([, name]) =>
      functionBody(backupCodesSrc, name).includes('generateAndStoreBackupCodes(')
    );
    expect(writers.map(([, n]) => n)).toEqual(['generateBackupCodes']);
    for (const [, , params] of writers) {
      expect(params).toMatch(/verificationCode\s*:\s*string/);
    }
  });
});

describe('generateBackupCodes keeps its guards (#563)', () => {
  const body = functionBody(backupCodesSrc, 'generateBackupCodes');

  it('requires a verificationCode and validates it before storing codes', () => {
    expect(body).toMatch(/verificationCode:\s*string/);
    const validateIdx = body.indexOf('Invalid verification code');
    const storeIdx = body.indexOf('generateAndStoreBackupCodes(');
    expect(validateIdx).toBeGreaterThan(-1);
    expect(storeIdx).toBeGreaterThan(validateIdx);
  });

  it('calls logAudit', () => {
    expect(body).toMatch(/await logAudit\(/);
  });
});
