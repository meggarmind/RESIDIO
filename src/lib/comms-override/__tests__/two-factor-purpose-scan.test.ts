import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The exempt purposes skip the communications override entirely, so each string
 * may appear only at its sanctioned call sites, the override module itself, and
 * tests. Anything else that passes one would send unredirected messages from UAT
 * data.
 *   self_auth_2fa  the two 2FA actions (self-addressed code to the signed-in user)
 *   inbound_reply  the two inbound WhatsApp Assistant reply sites (decision 8)
 */
const srcDir = fileURLToPath(new URL('../../..', import.meta.url));

const PURPOSES: Array<{ needle: string; allowed: string[] }> = [
  { needle: 'self_auth_2fa', allowed: ['actions/two-factor/setup.ts', 'actions/two-factor/verify.ts'] },
  { needle: 'inbound_reply', allowed: ['lib/whatsapp/identity.ts', 'lib/whatsapp/financial.ts'] },
];

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

describe.each(PURPOSES)('$needle exemption', ({ needle, allowed }) => {
  // Walks all of src; slow under load.
  const files = walk(srcDir);

  it('appears only at its sanctioned call sites, the override module and tests', () => {
    const offenders = files
      .filter((f) => !isException(f) && readFileSync(f, 'utf8').includes(needle))
      .map(rel)
      .filter((r) => !allowed.includes(r));
    expect(offenders).toEqual([]);
  }, 30000);

  it('is passed at every sanctioned call site', () => {
    for (const file of allowed) {
      const source = readFileSync(path.join(srcDir, file), 'utf8');
      const uses = source.split(`purpose: '${needle}'`).length - 1;
      expect(uses, file).toBe(needle === 'self_auth_2fa' ? 2 : 1);
    }
  }, 30000);
});
