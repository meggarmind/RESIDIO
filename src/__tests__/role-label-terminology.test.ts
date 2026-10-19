import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #84: resident-role display labels were renamed (Tenant -> Renter, Resident Landlord ->
 * Owner-Occupier, Non-Resident Landlord -> Property Owner, Co-Resident -> Occupant, Household
 * Member -> Family Member). Display text only: identifiers such as `tenant`, `co_resident` and
 * `hasTenant` are untouched. The patterns are whole-word and capitalised, so identifiers and
 * snake_case values do not match.
 */

const root = process.cwd();

// Admin-dashboard files whose user-visible strings and comments were migrated.
const FILES = [
  'src/actions/residents/update-resident-house.ts',
  'src/actions/residents/assign-house.ts',
  'src/actions/residents/unassign-house.ts',
  'src/actions/residents/move-out-landlord.ts',
  'src/actions/residents/move-out-renter.ts',
  'src/actions/residents/swap-resident-roles.ts',
  'src/actions/residents/transfer-ownership.ts',
  'src/actions/residents/validation.ts',
  'src/app/(dashboard)/houses/[id]/page.tsx',
  'src/components/houses/house-header.tsx',
  'src/components/houses/residents-tab.tsx',
  'src/components/houses/resident-row.tsx',
  'src/components/houses/link-resident-dialog.tsx',
  'src/components/houses/transfer-ownership-dialog.tsx',
  'src/components/houses/history-timeline.tsx',
  'src/components/announcements/announcement-form.tsx',
  'src/components/announcements/status-badges.tsx',
  'src/components/payments/email-receipt-dialog.tsx',
  'src/hooks/use-user-roles.ts',
  'src/actions/residents/remove-ownership.ts',
  'src/components/residents/linked-houses.tsx',
  'src/components/residents/owner-move-out-wizard.tsx',
  'src/app/(dashboard)/settings/billing/page.tsx',
  'src/components/billing/billing-profile-form.tsx',
  'src/types/database.ts',
];

// Multi-word role phrases are checked anywhere on a line (comments included), case-insensitively.
// snake_case identifiers (non_resident_landlord, co_resident) never match: no space or hyphen.
const PHRASE = /\b(non[- ]resident landlords?|resident landlords?|co-residents?|household members?)\b/i;

// Single words are checked only in prose: quoted strings containing whitespace and JSX text.
// Bare identifiers/values such as 'tenant', "tenants" or hasTenant are deliberately ignored.
const WORD = /\b(tenants?|landlords?)\b/i;

// "Vacant - Landlord assigned" is a house-status term pending an owner decision; not in scope.
const ALLOWED = /Vacant - Landlord assigned/gi;

function isComment(line: string): boolean {
  return /^(\/\/|\/\*|\*|\{\/\*)/.test(line.trim());
}

function proseSegments(rawLine: string): string[] {
  if (isComment(rawLine)) return [];
  const line = rawLine.replace(/\s\/\/.*$/, '').replace(ALLOWED, '');
  const quoted = [...line.matchAll(/(['"`])((?:\.|(?!\1).)*?)\1/g)]
    .map((m) => m[2])
    .filter((text) => /\s/.test(text));
  const jsxText = [...line.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1]);
  const jsxTail = [...line.matchAll(/^\s*([A-Za-z][^<>{}=:;'"\[\]]*\s[^<>{}=:;'"\[\]]*)$/g)].map((m) => m[1]);
  return [...quoted, ...jsxText, ...jsxTail];
}

describe('resident role display labels use the renamed terminology (#84)', () => {
  it.each(FILES)('%s contains no old role label', (file) => {
    const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
    const offenders = lines
      .map((text, i) => ({ line: i + 1, text: text.trim() }))
      .filter(
        ({ text }) => PHRASE.test(text.replace(ALLOWED, '')) || proseSegments(text).some((seg) => WORD.test(seg)),
      );
    expect(offenders).toEqual([]);
  });
});
