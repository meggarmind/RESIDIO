import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The 2FA exemption (`purpose: 'self_auth_2fa'`) skips the communications
 * override entirely, so the string may appear only at the two 2FA actions, the
 * override module itself, and tests. Anything else that passes it would send
 * unredirected messages from UAT data.
 */
const srcDir = fileURLToPath(new URL('../../..', import.meta.url));
const NEEDLE = 'self_auth_2fa';

const ALLOWED = new Set([
  'actions/two-factor/setup.ts',
  'actions/two-factor/verify.ts',
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function rel(file: string): string {
  return path.relative(srcDir, file).split(path.sep).join('/');
}

function isException(file: string): boolean {
  const r = rel(file);
  return r.startsWith('lib/comms-override/') || r.includes('__tests__/') || /\.test\.tsx?$/.test(r);
}

describe('self_auth_2fa exemption', () => {
  const files = walk(srcDir);

  it('appears in no file other than the two 2FA actions, the override module and tests', () => {
    const offenders = files
      .filter((f) => !isException(f) && readFileSync(f, 'utf8').includes(NEEDLE))
      .map(rel)
      .filter((r) => !ALLOWED.has(r));
    expect(offenders).toEqual([]);
  });

  it('is passed at both 2FA actions, on the email and the SMS send', () => {
    for (const file of ALLOWED) {
      const source = readFileSync(path.join(srcDir, file), 'utf8');
      const uses = source.split(`purpose: '${NEEDLE}'`).length - 1;
      expect(uses, file).toBe(2);
    }
  });
});
