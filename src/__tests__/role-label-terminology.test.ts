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
  'src/components/announcements/announcement-form.tsx',
  'src/components/announcements/status-badges.tsx',
  'src/components/payments/email-receipt-dialog.tsx',
  'src/hooks/use-user-roles.ts',
  'src/types/database.ts',
];

const OLD_LABEL =
  /\b(Non-Resident Landlords?|Resident Landlords?|Co-Residents?|Tenants?|Household Members?)\b/;

describe('resident role display labels use the renamed terminology (#84)', () => {
  it.each(FILES)('%s contains no old role label', (file) => {
    const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
    const offenders = lines
      .map((text, i) => ({ line: i + 1, text: text.trim() }))
      .filter(({ text }) => OLD_LABEL.test(text));
    expect(offenders).toEqual([]);
  });
});
