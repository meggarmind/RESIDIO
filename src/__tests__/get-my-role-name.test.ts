import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `get_my_role_name()` (#189, epic #182) has zero callers today. #190 is about
 * to retarget all 97 role-bucket RLS policies onto it at once (see
 * `role-access-matrix.md`), and its failure mode is silent denial: a policy
 * that reads `get_my_role_name() = ANY(ARRAY[...])` and gets NULL back simply
 * denies, indistinguishable from a correctly-denied role.
 *
 * These tests do not talk to the database — the capture was taken from it by
 * `supabase/probes/get-my-role-name.sql`, inside a transaction that ended in
 * ROLLBACK. What they guard is the two ways this safety net could quietly stop
 * telling the truth: a capture that is no longer a complete picture, and the
 * two behavioural facts #190 depends on going unverified — that
 * `get_my_role_name()` does not collapse roles into buckets the way
 * `get_my_role()` does, and that the difference does not run the other way too
 * (a case where the new function returns something and the legacy one returns
 * NULL, which would make a `get_my_role() IS NOT NULL` policy widen on
 * retarget).
 */

const capture = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../docs/validation/get-my-role-name.capture.json', import.meta.url)),
    'utf8'
  )
);

const BUILT_IN_ROLES = [
  'chairman',
  'financial_officer',
  'project_manager',
  'resident',
  'secretary',
  'security_officer',
  'super_admin',
  'vice_chairman',
];

describe('get_my_role_name() capture completeness', () => {
  it('covers all 8 built-in roles, by name', () => {
    expect([...capture.builtInRoles].sort()).toEqual([...BUILT_IN_ROLES].sort());
    expect(capture.builtInRoles).toHaveLength(8);
  });

  it('has a role case for every built-in role', () => {
    const roleCaseNames = capture.cases
      .filter((c: { case: string }) => c.case.startsWith('role = '))
      .map((c: { case: string }) => c.case.replace('role = ', ''));

    expect([...roleCaseNames].sort()).toEqual([...BUILT_IN_ROLES].sort());
  });

  it('captures all 13 behavioural cases', () => {
    // 8 built-in roles + custom role + pending + suspended + null role_id + anon.
    expect(capture.cases).toHaveLength(13);
  });

  it('never loses a case to a silently-dropped ordinal', () => {
    // Guards against a capture that looks complete by count (13 rows) but is
    // actually missing one case and duplicating another.
    const ords = capture.cases.map((c: { ord: number }) => c.ord);
    expect(new Set(ords).size).toBe(ords.length);
  });
});

describe('get_my_role_name() behavioural cases all passed', () => {
  it('has every case matching expected to actual', () => {
    const failures = capture.cases.filter(
      (c: { expected: string; actual: string }) => c.expected !== c.actual
    );
    expect(failures).toEqual([]);
  });

  it('returns each built-in role its own name', () => {
    for (const role of BUILT_IN_ROLES) {
      const c = capture.cases.find((x: { case: string }) => x.case === `role = ${role}`);
      expect(c, `missing case for ${role}`).toBeTruthy();
      expect(c.actual, role).toBe(role);
    }
  });

  it('resolves a custom (non-built-in) role by its own name', () => {
    const c = capture.cases.find((x: { case: string }) => x.case === 'custom (non-built-in) role');
    expect(c.actual).toBe('probe_custom_role');
  });

  it('returns NULL for every reason it can be denied a role name', () => {
    const nullCases = [
      'approval_status = pending',
      'approval_status = suspended',
      'role_id IS NULL',
      'no auth.uid() (anon)',
    ];

    for (const caseName of nullCases) {
      const c = capture.cases.find((x: { case: string }) => x.case === caseName);
      expect(c, `missing case: ${caseName}`).toBeTruthy();
      expect(c.actual, caseName).toBe('<NULL>');
    }
  });
});

describe('get_my_role_name() hardening', () => {
  it('is SECURITY DEFINER, STABLE, with the pinned search_path, returning text', () => {
    const h = capture.hardening.get_my_role_name;

    expect(h.prosecdef).toBe(true);
    expect(h.provolatile).toBe('s');
    expect(h.proconfig).toEqual(['search_path=public, auth, extensions, pg_temp']);
    expect(h.returnType).toBe('text');
  });

  it('matches get_my_role()\'s hardening exactly, except return type', () => {
    // get_my_role() returns the legacy `user_role` enum; get_my_role_name()
    // returns text. Everything that actually hardens the function -- SECURITY
    // DEFINER, STABLE, the pinned search_path -- must be byte-identical.
    const legacy = capture.hardening.get_my_role;
    const next = capture.hardening.get_my_role_name;

    expect(next.prosecdef).toBe(legacy.prosecdef);
    expect(next.provolatile).toBe(legacy.provolatile);
    expect(next.proconfig).toEqual(legacy.proconfig);

    // The one attribute that is expected to differ -- confirm it actually does,
    // so this test cannot pass by accident if someone hands get_my_role_name()
    // the legacy enum instead of text.
    expect(next.returnType).not.toBe(legacy.returnType);
    expect(legacy.returnType).toBe('user_role');
  });
});

describe('get_my_role_name() vs get_my_role(): the bucket-collapse hazard', () => {
  it('does not collapse vice_chairman into chairman the way get_my_role() does', () => {
    const cmp = capture.legacyVsNew.vice_chairman;

    expect(cmp.legacy).toBe('chairman');
    expect(cmp.new).toBe('vice_chairman');
    expect(cmp.new).not.toBe(cmp.legacy);
  });

  it('does not collapse financial_officer into financial_secretary the way get_my_role() does', () => {
    const cmp = capture.legacyVsNew.financial_officer;

    expect(cmp.legacy).toBe('financial_secretary');
    expect(cmp.new).toBe('financial_officer');
    expect(cmp.new).not.toBe(cmp.legacy);
  });
});

describe('get_my_role_name() vs get_my_role(): the inverse widening hazard', () => {
  it.each(['project_manager', 'secretary', 'resident'])(
    '%s resolves under get_my_role_name() but is NULL under get_my_role()',
    (role) => {
      const cmp = capture.legacyVsNew[role];

      // The legacy `user_role` enum cannot express these roles at all, so a
      // real holder carries a NULL legacy value.
      expect(cmp.legacy).toBeNull();
      expect(cmp.new).toBe(role);

      // This is the shape of the hazard: `get_my_role() IS NOT NULL` would be
      // false for these roles today and true after a naive retarget onto
      // get_my_role_name() -- a widening, not a narrowing. Pinning both sides
      // is what would catch a future policy written that way.
      expect(cmp.legacy === null && cmp.new !== null).toBe(true);
    }
  );

  it('records that no live policy is shaped to be hit by this (measured, not assumed)', () => {
    expect(capture.notes.inverseWideningHazard).toMatch(/81 use/);
    expect(capture.notes.inverseWideningHazard).toMatch(/16 use/);
    expect(capture.notes.inverseWideningHazard).toMatch(/zero use/);
  });
});
