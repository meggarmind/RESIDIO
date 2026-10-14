import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #556 item 9: three exported server actions had no callers and no authorization
 * (deactivateExpiredCodes, checkOverduePayments) or could never succeed
 * (startApprovedImpersonationSession). They were deleted. Bringing one back must be a
 * visible, deliberate act that edits this list.
 */

const root = process.cwd();

// A filesystem walk, not a behavioural assertion: give it room under load (#255, #497).
const SCAN_TIMEOUT_MS = 30_000;

const REMOVED = ['deactivateExpiredCodes', 'checkOverduePayments', 'startApprovedImpersonationSession'];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe('dead server actions stay removed (#556)', () => {
  for (const name of REMOVED) {
    it(`${name} is not declared or re-exported anywhere under src/`, () => {
      const declared = new RegExp(
        String.raw`(function\s+${name}\b|(const|let|var)\s+${name}\b|export\s*(type\s*)?\{[^}]*\b${name}\b[^}]*\})`
      );
      const offenders = walk(join(root, 'src'))
        .filter((f) => /\.(ts|tsx)$/.test(f))
        .filter((f) => !f.endsWith('dead-actions-removed.test.ts'))
        .filter((f) => declared.test(readFileSync(f, 'utf8')))
        .map((f) => relative(root, f).split('\\').join('/'));
      expect(offenders).toEqual([]);
    }, SCAN_TIMEOUT_MS);
  }
});
