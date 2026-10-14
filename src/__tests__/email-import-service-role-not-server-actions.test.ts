import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Issue #561: these four functions use the service-role client (or write state) with no
 * authentication or audit. They were exported from 'use server' files and so were callable as
 * public server actions. They now live in src/lib/email-imports/ (no 'use server'), called only
 * by the CRON_SECRET cron route, fetch-emails and guarded actions.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));

const MOVED: Record<string, string> = {
  parseEmailMessage: 'src/lib/email-imports/parse-email.ts',
  parseAllPendingEmails: 'src/lib/email-imports/parse-email.ts',
  matchEmailTransactions: 'src/lib/email-imports/process-email-matching.ts',
  updateGmailSyncStatus: 'src/lib/email-imports/gmail-sync-status.ts',
};

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const actionFiles = walk(join(root, 'src/actions/email-imports')).filter(
  (f) => /\.tsx?$/.test(f) && !f.includes('__tests__'),
);

function exportsName(source: string, name: string): boolean {
  const decl = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${name}\\b`);
  const list = new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`, 's');
  return decl.test(source) || list.test(source);
}

describe('email-import service-role functions are not server actions (#561)', () => {
  it('scans a non-trivial set of action files', () => {
    expect(actionFiles.length).toBeGreaterThan(5);
  });

  for (const name of Object.keys(MOVED)) {
    it(`${name} is not exported from any file under src/actions/email-imports`, () => {
      const offenders = actionFiles.filter((f) => exportsName(readFileSync(f, 'utf8'), name));
      expect(offenders).toEqual([]);
    });
  }

  for (const [name, file] of Object.entries(MOVED)) {
    it(`${name} lives in ${file}, which has no 'use server' directive`, () => {
      const source = read(file);
      expect(exportsName(source, name)).toBe(true);
      expect(source).not.toMatch(/^\s*['"]use server['"]/m);
    });
  }
});
