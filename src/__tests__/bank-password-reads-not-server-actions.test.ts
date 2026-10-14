import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Issue #568: getDecryptedPassword, getPasswordByAccountLast4 and getAllBankPasswords return
 * decrypted bank-statement PDF passwords with no permission check. They were exported from a
 * 'use server' file and so were client-callable. They now live in
 * src/lib/email-imports/bank-passwords.ts (no 'use server'); RLS is the gate. This pins that no
 * server action re-exposes them.
 */

const SCAN_TIMEOUT_MS = 30_000;
const root = fileURLToPath(new URL('../..', import.meta.url));
const LIB_FILE = 'src/lib/email-imports/bank-passwords.ts';
const NAMES = ['getDecryptedPassword', 'getPasswordByAccountLast4', 'getAllBankPasswords'];
const ALLOWED_IMPORTERS = [
  'src/actions/imports/parse-pdf-statement.ts',
  'src/lib/email-imports/parsers/first-bank-pdf.ts',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function rel(f: string): string {
  return relative(root, f).split('\\').join('/');
}

function sourceFiles(dir: string): string[] {
  return walk(join(root, dir)).filter(
    (f) => /\.tsx?$/.test(f) && !/__tests__|\.test\.tsx?$/.test(rel(f)),
  );
}

function exportsName(source: string, name: string): boolean {
  const decl = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${name}\\b`);
  const list = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`, 's');
  return decl.test(source) || list.test(source);
}

describe('decrypted bank-password reads are not server actions (#568)', () => {
  it('scans a non-trivial set of action files', () => {
    expect(sourceFiles('src/actions').length).toBeGreaterThan(20);
  }, SCAN_TIMEOUT_MS);

  for (const name of NAMES) {
    it(`${name} is not exported from any file under src/actions`, () => {
      const offenders = sourceFiles('src/actions')
        .filter((f) => exportsName(readFileSync(f, 'utf8'), name))
        .map(rel);
      expect(offenders).toEqual([]);
    }, SCAN_TIMEOUT_MS);
  }

  it(`${LIB_FILE} has no 'use server' directive and exports all three`, () => {
    const source = readFileSync(join(root, LIB_FILE), 'utf8');
    expect(source).not.toMatch(/^\s*['"]use server['"]/m);
    for (const name of NAMES) expect(exportsName(source, name)).toBe(true);
  });

  it('only the two known server-side callers import the lib module', () => {
    const importers = sourceFiles('src')
      .filter((f) => /@\/lib\/email-imports\/bank-passwords['"]/.test(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(importers).toEqual([...ALLOWED_IMPORTERS].sort());
  }, SCAN_TIMEOUT_MS);
});
