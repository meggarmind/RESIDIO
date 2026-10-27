import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESIDING_ROLES, isResidingRole } from '@/lib/houses/occupancy';

/** House occupancy counts residing roles only (#1148). Migration text is pinned; no database. */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(path.join(root, 'supabase/migrations/20261101110000_house_occupancy_residing_roles.sql'), 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

describe('isResidingRole', () => {
  it('accepts only tenant and resident_landlord', () => {
    expect([...RESIDING_ROLES]).toEqual(['tenant', 'resident_landlord']);
    expect(isResidingRole('tenant')).toBe(true);
    expect(isResidingRole('resident_landlord')).toBe(true);
  });

  it.each(['non_resident_landlord', 'developer', 'co_resident', 'household_member', 'domestic_staff', 'caretaker', 'contractor', '', null, undefined])(
    'rejects %s',
    (role) => {
      expect(isResidingRole(role as string | null | undefined)).toBe(false);
    },
  );
});

describe('house occupancy migration', () => {
  it('redefines the trigger function as security definer with a pinned search_path', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_house_occupancy()');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'");
  });

  it('filters the occupancy test on both residing roles, in the function and the recompute', () => {
    const filter = "rh.resident_role::text IN ('tenant', 'resident_landlord')";
    expect(sql.split(filter).length - 1).toBe(3);
  });

  it('requires an active link in both the function and the recompute', () => {
    expect(sql.split('rh.is_active = true').length - 1).toBe(3);
  });

  it('recomputes every house, writing only the rows that differ', () => {
    expect(sql).toContain('UPDATE public.houses h SET is_occupied = EXISTS(');
    expect(sql).toContain('WHERE h.is_occupied IS DISTINCT FROM EXISTS(');
  });

  it('does not touch property_status', () => {
    expect(sql).not.toContain('property_status');
  });
});

describe('residents actions leave occupancy to the trigger', () => {
  const read = (f: string) => readFileSync(path.join(root, 'src/actions/residents', f), 'utf8');
  const files = ['move-out-landlord.ts', 'move-out-owner.ts', 'move-out-renter.ts', 'remove-ownership.ts', 'unassign-house.ts'];

  it.each(files)('%s writes no is_occupied: false', (f) => {
    expect(read(f)).not.toMatch(/\.update\(\{\s*is_occupied:\s*false/);
  });

  it('move-out-renter.ts writes no unguarded is_occupied: true', () => {
    expect(read('move-out-renter.ts')).not.toMatch(/\.update\(\{\s*is_occupied:\s*true/);
  });
});
