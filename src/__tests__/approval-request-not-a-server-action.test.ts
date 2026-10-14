import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #560: createApprovalRequest only checked getUser(), so as an export of a
 * 'use server' module it was a client-callable action any authenticated user could invoke.
 * It now lives in src/lib/approvals/ (no directive) and must never come back under
 * src/actions/**.
 */

const root = process.cwd();

// A filesystem walk, not a behavioural assertion: give it room under load (#255, #497).
const SCAN_TIMEOUT_MS = 30_000;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('createApprovalRequest is not on the server-action surface (#560)', () => {
  it('no module under src/actions/** declares or re-exports createApprovalRequest', () => {
    const offenders = walk(join(root, 'src/actions'))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => {
        const src = readFileSync(f, 'utf8');
        return (
          /export\s+(async\s+)?function\s+createApprovalRequest\b/.test(src) ||
          /export\s+(const|let)\s+createApprovalRequest\b/.test(src) ||
          /export\s*(type\s*)?\{[^}]*\bcreateApprovalRequest\b[^}]*\}/.test(src)
        );
      });
    expect(offenders).toEqual([]);
  }, SCAN_TIMEOUT_MS);

  // A wrapper or `export *` would reopen the hole without matching the name above, so also
  // pin which action files may import the lib function at all: only the two guarded callers.
  it('only the two guarded callers import the lib function from src/actions/**', () => {
    const importers = walk(join(root, 'src/actions'))
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .filter((f) => /@\/lib\/approvals\/create-approval-request/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(root, f).split('\\').join('/'))
      .sort();
    expect(importers).toEqual(['src/actions/billing/profiles.ts', 'src/actions/houses/update-house.ts']);
  }, SCAN_TIMEOUT_MS);

  it('the lib module has no use-server directive', () => {
    const src = readFileSync(join(root, 'src/lib/approvals/create-approval-request.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*['"]use server['"]/m);
    expect(src).toMatch(/export\s+async\s+function\s+createApprovalRequest\b/);
  });
});
