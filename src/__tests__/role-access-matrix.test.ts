import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { diffMatrices } from '../../scripts/diff-role-access-matrix.mjs';
import { buildMatrix } from '../../scripts/build-role-access-matrix.mjs';

type Matrix = {
  tableCount: number;
  roles: string[];
  verdicts: Record<string, Record<string, string>>;
  readNonEmpty: Record<string, string[]>;
};

/**
 * The role-access matrix (#185, epic #182) is how ~130 policy rewrites in #186,
 * #187 and #190 are proven not to have changed who can read what.
 *
 * The hazard it exists for is invisible in a diff. `get_my_role()` collapses
 * `vice_chairman` into `chairman` and `financial_officer` into
 * `financial_secretary`, so a rewrite that renames literals instead of expanding
 * buckets revokes an entire role across dozens of tables and leaves perfectly
 * well-formed policies behind. Nothing structural catches that.
 *
 * These tests do not talk to the database — the baseline was captured from it by
 * `supabase/probes/role-access-matrix.sql`. What they guard is the two ways this
 * safety net could quietly stop working: a baseline that is no longer a complete
 * picture, and a diff tool that fails to shout when a cell narrows.
 */

const baseline = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../docs/validation/role-access-matrix.baseline.json', import.meta.url)),
    'utf8'
  )
);

/** Every built-in role. #185 requires vice_chairman and financial_officer explicitly. */
const BUILT_IN_ROLES = [
  'super_admin',
  'chairman',
  'vice_chairman',
  'financial_officer',
  'security_officer',
  'secretary',
  'project_manager',
];

const VERDICTS = ['allow', 'deny', 'row-dependent', 'no-grant', 'no-policy'];

describe('role-access matrix baseline', () => {
  it('covers every built-in role', () => {
    expect([...baseline.roles].sort()).toEqual([...BUILT_IN_ROLES].sort());
  });

  it('covers the same tables for every role', () => {
    const reference = Object.keys(baseline.verdicts[BUILT_IN_ROLES[0]]).sort();

    for (const role of BUILT_IN_ROLES) {
      expect(Object.keys(baseline.verdicts[role]).sort(), role).toEqual(reference);
    }
    expect(reference).toHaveLength(baseline.tableCount);
  });

  it('uses only known verdicts', () => {
    const seen = new Set<string>();
    for (const role of BUILT_IN_ROLES) {
      for (const verdict of Object.values(baseline.verdicts[role])) seen.add(verdict as string);
    }

    expect([...seen].filter((v) => !VERDICTS.includes(v))).toEqual([]);
  });

  it('never claims a role was denied a table it actually read rows from', () => {
    // `allow`/`row-dependent` come from evaluating the deployed policy
    // expressions; readNonEmpty comes from actually counting rows. They are
    // independent, and this is where they have to agree.
    const contradictions: string[] = [];

    for (const role of BUILT_IN_ROLES) {
      for (const table of baseline.readNonEmpty[role]) {
        const verdict = baseline.verdicts[role][table];
        if (verdict === 'deny' || verdict === 'no-grant') {
          contradictions.push(`${role}:${table} read rows but verdict is ${verdict}`);
        }
      }
    }

    expect(contradictions).toEqual([]);
  });

  it('records the facts this epic is built on', () => {
    // super_admin reaches everything the grants allow. If this ever fails, the
    // capture is broken (an empty probe profile denies everything), not the RBAC.
    const superAdmin = baseline.verdicts.super_admin;
    expect(Object.values(superAdmin).filter((v) => v === 'deny')).toEqual([]);

    // ADR-0006: chairman must not read audit logs. #181 made that true in the
    // database. The matrix is where that stays true.
    expect(baseline.verdicts.chairman.audit_logs).toBe('deny');

    // ADR-0007's latent bug, measured: vice_chairman has no legacy role value, so
    // every policy still reading `profiles.role` denies it. #186/#187 are expected
    // to flip these to allow — which is why they are recorded now.
    for (const table of [
      'estate_bank_account_passwords',
      'gmail_oauth_credentials',
      'search_logs',
      'whatsapp_provider_credentials',
      'late_fee_waivers',
    ]) {
      expect(baseline.verdicts.vice_chairman[table], table).toBe('deny');
    }
  });
});

describe('role-access matrix diff', () => {
  const clone = () => JSON.parse(JSON.stringify(baseline));

  it('reports nothing when the matrix is unchanged', () => {
    const { changes, structural, unmet } = diffMatrices(baseline, clone(), new Map());

    expect({ changes, structural, unmet }).toEqual({ changes: [], structural: [], unmet: [] });
  });

  it('flags a bucket collapse as a narrowing', () => {
    // The exact shape of the hazard: a rewrite renames get_my_role() literals
    // instead of expanding them, and vice_chairman loses access everywhere.
    const fresh = clone();
    for (const table of ['audit_logs', 'invoices', 'residents']) {
      fresh.verdicts.vice_chairman[table] = 'deny';
    }

    const { changes } = diffMatrices(baseline, fresh, new Map());
    const narrowed = changes.filter((c: { narrowing: boolean }) => c.narrowing);

    expect(narrowed.map((c: { table: string }) => c.table).sort()).toEqual([
      'audit_logs',
      'invoices',
      'residents',
    ]);
    expect(narrowed.every((c: { role: string }) => c.role === 'vice_chairman')).toBe(true);
  });

  it('treats row-dependent as less access than allow', () => {
    const fresh = clone();
    fresh.verdicts.chairman.invoices = 'row-dependent';

    const [change] = diffMatrices(baseline, fresh, new Map()).changes;

    expect(change.narrowing).toBe(true);
  });

  it('does not call a widening a narrowing', () => {
    const fresh = clone();
    fresh.verdicts.chairman.audit_logs = 'allow';

    const [change] = diffMatrices(baseline, fresh, new Map()).changes;

    expect(change.narrowing).toBe(false);
  });

  it('accepts a declared expectation and reports one that never happened', () => {
    const fresh = clone();
    fresh.verdicts.vice_chairman.search_logs = 'allow';

    const met = diffMatrices(
      baseline,
      fresh,
      new Map([['vice_chairman:search_logs', 'allow']])
    );
    expect(met.changes[0].expected).toBe(true);
    expect(met.unmet).toEqual([]);

    const missed = diffMatrices(baseline, clone(), new Map([['vice_chairman:search_logs', 'allow']]));
    expect(missed.unmet).toEqual(['vice_chairman:search_logs=allow']);
  });

  it('reports a table that appears or disappears rather than ignoring it', () => {
    const added = clone();
    added.verdicts.super_admin.brand_new_table = 'allow';
    expect(diffMatrices(baseline, added, new Map()).structural).toEqual([
      'super_admin: brand_new_table is new — add it to the baseline',
    ]);

    const removed = clone();
    delete removed.verdicts.super_admin.invoices;
    expect(diffMatrices(baseline, removed, new Map()).structural).toEqual([
      'super_admin: invoices missing from the fresh capture',
    ]);
  });
});

describe('role-access matrix build', () => {
  const capture = (role: string) => ({
    role_name: role,
    by_verdict: { allow: ['invoices'], deny: ['audit_logs'] },
    read_nonempty: ['invoices'],
  });

  it('flattens the probe output into one verdict per table', () => {
    const matrix = buildMatrix([capture('super_admin')], '2026-09-04') as unknown as Matrix;

    expect(matrix.verdicts.super_admin).toEqual({ invoices: 'allow', audit_logs: 'deny' });
    expect(matrix.tableCount).toBe(2);
  });

  it('refuses a capture that contradicts itself', () => {
    // Rows were read from a table the policy evaluation says is denied. Letting
    // this through would bake a wrong baseline in and make every later diff lie.
    expect(() =>
      buildMatrix(
        [{ role_name: 'chairman', by_verdict: { deny: ['invoices'] }, read_nonempty: ['invoices'] }],
        '2026-09-04'
      )
    ).toThrow(/contradicts itself/);
  });

  it('refuses captures whose table sets disagree', () => {
    const partial = { role_name: 'chairman', by_verdict: { allow: ['invoices'] }, read_nonempty: [] };

    expect(() => buildMatrix([capture('super_admin'), partial], '2026-09-04')).toThrow(
      /table set differs/
    );
  });
});
