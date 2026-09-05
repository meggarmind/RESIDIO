import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `get_my_role_name()` (#189, epic #182) has zero callers today. #190 is about
 * to retarget all 97 role-bucket RLS policies onto it at once (ADR-0007,
 * epic #182 -- `role-access-matrix.md` documents the per-role access verdicts
 * those policies currently produce, not the policy count itself), and its
 * failure mode is silent denial: a policy that reads
 * `get_my_role_name() = ANY(ARRAY[...])` and gets NULL back simply denies,
 * indistinguishable from a correctly-denied role.
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

  it('has a role case for every built-in role (a live re-run against a database that already has custom roles may add more)', () => {
    const roleCaseNames = capture.cases
      .filter((c: { case: string }) => c.case.startsWith('role = '))
      .map((c: { case: string }) => c.case.replace('role = ', ''));

    // The probe's role loop iterates every row in app_roles, built-in or
    // custom (see supabase/probes/get-my-role-name.sql). All 8 built-ins must
    // be present; a pre-existing custom role on the database the probe was
    // re-run against is tolerated, not rejected.
    expect(roleCaseNames).toEqual(expect.arrayContaining(BUILT_IN_ROLES));
    expect(new Set(roleCaseNames).size, 'no role captured twice').toBe(roleCaseNames.length);
  });

  it('captures at least the 13 behavioural cases (8 built-in roles + 5 fixed edge cases)', () => {
    const roleCaseCount = capture.cases.filter((c: { case: string }) => c.case.startsWith('role = ')).length;
    const nonRoleCaseCount = capture.cases.length - roleCaseCount;

    // custom (non-built-in) role, pending, suspended, null role_id, anon -- this
    // count is fixed regardless of how many role rows the loop found.
    expect(nonRoleCaseCount).toBe(5);
    expect(roleCaseCount).toBeGreaterThanOrEqual(8);
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

describe('legacyVsNew completeness and internal consistency', () => {
  // The full, literal mapping #190 reads as its bucket-expansion table. Every
  // one of the 8 built-in roles is pinned to an exact value here -- not just
  // the 5 roles the earlier hazard tests below happen to exercise -- because
  // `super_admin.legacy` is the single most consequential cell in the file:
  // ADR-0007's expansion rule turns `get_my_role() IN ('admin','chairman')`
  // into four RBAC roles, so a wrong `admin` mapping revokes super_admin
  // across 36 tables.
  const EXPECTED_LEGACY_VS_NEW: Record<string, { legacy: string | null; new: string }> = {
    super_admin: { legacy: 'admin', new: 'super_admin' },
    chairman: { legacy: 'chairman', new: 'chairman' },
    vice_chairman: { legacy: 'chairman', new: 'vice_chairman' },
    financial_officer: { legacy: 'financial_secretary', new: 'financial_officer' },
    security_officer: { legacy: 'security_officer', new: 'security_officer' },
    project_manager: { legacy: null, new: 'project_manager' },
    secretary: { legacy: null, new: 'secretary' },
    resident: { legacy: null, new: 'resident' },
  };

  it('has exactly the 8 built-in roles as keys -- no more, no fewer', () => {
    expect(Object.keys(capture.legacyVsNew).sort()).toEqual([...BUILT_IN_ROLES].sort());
  });

  it.each(Object.keys(EXPECTED_LEGACY_VS_NEW))('pins %s to its exact literal legacy/new mapping', (role) => {
    expect(capture.legacyVsNew[role], `missing legacyVsNew.${role}`).toEqual(EXPECTED_LEGACY_VS_NEW[role]);
  });

  it('agrees with the behavioural cases: legacyVsNew[role].new is what role = <role> actually returned', () => {
    // A capture that is internally contradictory -- e.g. legacyVsNew claiming
    // `super_admin.new = 'admin'` while the `role = super_admin` case recorded
    // `actual: 'super_admin'` -- must fail here, the way
    // role-access-matrix.test.ts's "never claims a role was denied a table it
    // actually read rows from" catches the equivalent contradiction there.
    for (const role of BUILT_IN_ROLES) {
      const roleCase = capture.cases.find((c: { case: string }) => c.case === `role = ${role}`);
      expect(roleCase, `missing case for ${role}`).toBeTruthy();
      expect(capture.legacyVsNew[role].new, role).toBe(roleCase.actual);
    }
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
    // Structured and numeric, not a regex over prose the note can be reworded
    // out from under: the 97 policies calling get_my_role() split as 81
    // `= ANY(ARRAY[...])`, 16 `= 'literal'`, and zero `IS NULL`/`IS NOT NULL` --
    // the last figure is what makes the widening hazard latent rather than live.
    expect(capture.policyShapes.anyArray).toBe(81);
    expect(capture.policyShapes.equalsLiteral).toBe(16);
    expect(capture.policyShapes.isNullOrNotNull).toBe(0);
    expect(capture.policyShapes.anyArray + capture.policyShapes.equalsLiteral).toBe(
      capture.policyShapes.totalPoliciesCallingGetMyRole
    );
  });
});
