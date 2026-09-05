import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Issue #187 (epic #182) rewrites fifteen RLS policies that authorized by
 * reading the legacy `profiles.role` column so each instead calls
 * `has_permission()`. `profiles.role` is the dead vocabulary per ADR-0007 --
 * `handle_new_user()` writes NULL to it and epic #182 drops it -- so a policy
 * still reading it changes meaning without anyone editing it. This is the
 * same job #186 (part A) did for a different fourteen policies.
 *
 * These are structural assertions over the migration file, not behavioural
 * ones: nothing here connects to a database, the same approach as
 * `legacy-policies-part-a.test.ts` and `legacy-role-migration-ratchet.test.ts`.
 * What it can prove is that the migration as written is the migration that was
 * reviewed -- exact policy names, exact commands, exact permission per table
 * -- which is what a later reader diffing the live policy set against the
 * #185 baseline needs.
 *
 * The pin is `toEqual`-style rather than "contains a has_permission call",
 * because the failure mode worth catching is a *swap* -- the right shape with
 * the wrong permission name, e.g. `announcements.view` where
 * `announcements.publish` was chosen for read_receipts_admin_select to avoid
 * widening who sees resident-identifying read data. A subset assertion passes
 * that silently; see part A's own doc comment for the same reasoning.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const MIGRATION_FILE = '20260905002000_policies_part_b_follow_permissions.sql';

/**
 * Normalised to LF because the assertions below match multi-line CREATE POLICY
 * blocks literally, and a CRLF checkout on Windows would otherwise fail every
 * one of them for a reason that has nothing to do with the policy.
 */
const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the old
 * `profiles.role` predicates -- so a check for legacy references that scanned
 * the whole file could never pass, and one that scanned nothing would never
 * fail. The `^`-anchored `BEGIN;` skips the commented `-- BEGIN;` that opens
 * the rollback block.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/** Active SQL with `--` comments removed, so section prose cannot satisfy a check. */
const activeStatements = activeSql.replace(/--[^\n]*/g, '');

/**
 * The rollback block only, sliced from its own `-- ROLLBACK:` marker rather
 * than from the top of the file.
 *
 * The distinction is load-bearing and was got wrong once in part A: slicing
 * from offset zero pulls in the header, which names `profiles.role` in its
 * third line, so every assertion about the rollback block's *contents* was
 * satisfied by the header and passed no matter what the rollback block said.
 */
const rollback = migration.slice(
  migration.indexOf('-- ROLLBACK:'),
  migration.indexOf('\nBEGIN;')
);

/**
 * The rollback block's restoring statement for one policy: from its
 * `-- CREATE POLICY "<name>"` line to the start of the next commented
 * CREATE POLICY, or to the block's closing `-- COMMIT;`.
 */
function rollbackStatement(policy: string): string {
  const start = rollback.indexOf(`-- CREATE POLICY "${policy}"`);
  if (start === -1) return '';

  const rest = rollback.slice(start + 1);
  const nextCreate = rest.indexOf('-- CREATE POLICY "');
  const commit = rest.indexOf('-- COMMIT;');
  const ends = [nextCreate, commit].filter((n) => n !== -1);

  return rest.slice(0, ends.length > 0 ? Math.min(...ends) : rest.length);
}

/**
 * The fifteen policies, as `[table, policy name, command, permission,
 * hasWithCheck]`.
 *
 * The permission column is the decision this slice actually makes, and it was
 * verified against `role_permissions` before the migration was written. It is
 * restated here rather than derived from the migration so that changing the
 * migration alone cannot make this file agree with it.
 *
 * `hasWithCheck` distinguishes the two UPDATE policies and the three ALL
 * policies (both clauses) from the SELECT/DELETE policies (USING only) and
 * the two INSERT policies (WITH CHECK only).
 */
const POLICIES: ReadonlyArray<{
  table: string;
  policy: string;
  cmd: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  permission: string;
}> = [
  {
    table: 'announcements',
    policy: 'announcements_admin_select',
    cmd: 'SELECT',
    permission: 'announcements.view',
  },
  {
    table: 'announcements',
    policy: 'announcements_admin_insert',
    cmd: 'INSERT',
    permission: 'announcements.create',
  },
  {
    table: 'announcements',
    policy: 'announcements_admin_update',
    cmd: 'UPDATE',
    permission: 'announcements.update',
  },
  {
    table: 'announcements',
    policy: 'announcements_admin_delete',
    cmd: 'DELETE',
    permission: 'announcements.delete',
  },
  {
    table: 'announcement_categories',
    policy: 'announcement_categories_admin_all',
    cmd: 'ALL',
    permission: 'announcements.manage_categories',
  },
  {
    table: 'announcement_read_receipts',
    policy: 'read_receipts_admin_select',
    cmd: 'SELECT',
    permission: 'announcements.publish',
  },
  {
    table: 'message_templates',
    policy: 'message_templates_admin_all',
    cmd: 'ALL',
    permission: 'announcements.manage_templates',
  },
  {
    table: 'in_app_notifications',
    policy: 'in_app_notifications_admin_insert',
    cmd: 'INSERT',
    permission: 'notifications.send',
  },
  {
    table: 'report_subscriptions',
    policy: 'report_subscriptions_admin_select',
    cmd: 'SELECT',
    permission: 'report_subscriptions.view',
  },
  {
    table: 'report_subscriptions',
    policy: 'report_subscriptions_admin_insert',
    cmd: 'INSERT',
    permission: 'report_subscriptions.manage',
  },
  {
    table: 'report_subscriptions',
    policy: 'report_subscriptions_admin_update',
    cmd: 'UPDATE',
    permission: 'report_subscriptions.manage',
  },
  {
    table: 'search_logs',
    policy: 'Admins can view search logs',
    cmd: 'SELECT',
    permission: 'settings.view_audit_logs',
  },
  {
    table: 'late_fee_log',
    policy: 'Admins can view late fee log',
    cmd: 'SELECT',
    permission: 'billing.apply_late_fees',
  },
  {
    table: 'late_fee_waivers',
    policy: 'Admins can manage late fee waivers',
    cmd: 'ALL',
    permission: 'billing.request_late_fee_waiver',
  },
  {
    table: 'petty_cash_accounts',
    policy: 'Admins can manage petty cash accounts',
    cmd: 'ALL',
    permission: 'manage_expenditure',
  },
];

/**
 * The prior (legacy) definition's USING/WITH CHECK shape, per policy, as
 * transcribed from `.187-prior-policies.txt` at authoring time. Used only to
 * pin the rollback block, which must restore exactly what was live -- not
 * what the new policy's shape convention would suggest. late_fee_waivers and
 * petty_cash_accounts are FOR ALL policies that, live, had WITH CHECK: none
 * (Postgres defaults it to USING), so the rollback restores them with no
 * WITH CHECK clause at all.
 */
const PRIOR_HAS_WITH_CHECK: Record<string, boolean> = {
  announcements_admin_select: false,
  announcements_admin_insert: true,
  announcements_admin_update: true,
  announcements_admin_delete: false,
  announcement_categories_admin_all: true,
  read_receipts_admin_select: false,
  message_templates_admin_all: true,
  in_app_notifications_admin_insert: true,
  report_subscriptions_admin_select: false,
  report_subscriptions_admin_insert: true,
  report_subscriptions_admin_update: true,
  'Admins can view search logs': false,
  'Admins can view late fee log': false,
  'Admins can manage late fee waivers': false,
  'Admins can manage petty cash accounts': false,
};

/**
 * Policies deliberately not part of this slice, kept here only as a guard
 * against accidental scope creep. Unlike part A, none of these fifteen tables
 * carry a resident-scoped sibling policy worth naming individually, so this
 * list stays empty; the "no others" count check below is what actually
 * enforces scope.
 */
const MUST_NOT_TOUCH: string[] = [];

/** The exact `CREATE POLICY` text the migration is pinned to, per command. */
function expectedCreate(entry: (typeof POLICIES)[number]): string {
  const call = `public.has_permission('${entry.permission}')`;
  const head = `CREATE POLICY "${entry.policy}"\n  ON public.${entry.table} FOR ${entry.cmd} TO authenticated`;

  if (entry.cmd === 'INSERT') {
    return `${head}\n  WITH CHECK (${call});`;
  }
  if (entry.cmd === 'SELECT' || entry.cmd === 'DELETE') {
    return `${head}\n  USING (${call});`;
  }
  // ALL and UPDATE both carry both clauses in the new policy, regardless of
  // whether the legacy definition stated WITH CHECK explicitly.
  return `${head}\n  USING (${call})\n  WITH CHECK (${call});`;
}

describe('#187 part B: legacy profiles.role policies follow has_permission()', () => {
  it('the migration exists under the agreed filename', () => {
    // Pinned by exact name, not by suffix match: the applied-migrations record
    // is keyed on the filename, and a rename after review is how a migration
    // ends up applied twice or not at all.
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('sorts after the other 20260905 migrations', () => {
    // Deliberately does not spell out the sibling filenames: one of them
    // names a dropped legacy function, and a sibling test scans every file
    // under src/** for that exact function name to prove it survives nowhere
    // but generated type stubs. Quoting the filename here would make this
    // file a second (false) match for that scan.
    const siblings = readdirSync(migrationsDir)
      .filter((f) => f.startsWith('20260905'))
      .sort();
    expect(siblings).toHaveLength(3);
    expect(siblings[siblings.length - 1]).toBe(MIGRATION_FILE);
  });

  it('wraps its work in a single transaction', () => {
    // All fifteen policies land or none do. A partial apply would leave some
    // tables gated on a column the next migration in epic #182 removes.
    expect(activeSql).not.toBe('');
    expect((migration.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
  });

  it.each(POLICIES)('rewrites "$policy" on $table onto $permission', (entry) => {
    // The DROP must name the same policy as the CREATE. Recreating under a
    // new name would leave the legacy policy live alongside the new one, and
    // RLS policies are OR-ed -- the old role check would still admit callers.
    expect(activeSql).toContain(
      `DROP POLICY IF EXISTS "${entry.policy}" ON public.${entry.table};`
    );
    expect(activeSql).toContain(expectedCreate(entry));
  });

  it('names exactly these fifteen policies and no others', () => {
    // Counting is what makes the per-policy checks above sufficient: without
    // it, a sixteenth DROP POLICY for something outside this slice's scope
    // would pass every other assertion in this file.
    const dropped = [...activeSql.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+);/g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const created = [...activeSql.matchAll(/CREATE POLICY "([^"]+)"\n  ON public\.(\w+) /g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const expected = POLICIES.map((p) => `${p.table}.${p.policy}`);

    expect(dropped).toEqual(expected);
    expect(created).toEqual(expected);
    expect((activeSql.match(/DROP POLICY/g) ?? []).length).toBe(15);
    expect((activeSql.match(/CREATE POLICY/g) ?? []).length).toBe(15);
  });

  it('every DROP is re-runnable and precedes its own CREATE', () => {
    // Same policy names in and out, so `IF EXISTS` is what keeps a second
    // apply from aborting with 42710 (duplicate policy) instead of being a
    // no-op. Ordering matters because CREATE on an existing name fails.
    for (const entry of POLICIES) {
      const dropAt = activeSql.indexOf(`DROP POLICY IF EXISTS "${entry.policy}"`);
      const createAt = activeSql.indexOf(`CREATE POLICY "${entry.policy}"`);
      expect(dropAt, `${entry.policy}: DROP not found`).toBeGreaterThan(-1);
      expect(dropAt, `${entry.policy}: DROP must precede CREATE`).toBeLessThan(createAt);
    }
  });

  it('no executable statement reads the legacy profiles.role column', () => {
    // The whole point of the slice. Checked against comment-stripped active
    // SQL so that neither the header nor the rollback block can mask a real
    // reference that survived in the body.
    expect(activeStatements).not.toContain('profiles.role');
    expect(activeStatements).not.toMatch(/\brole\s+(?:IN|=\s*ANY)\b/i);
    expect(activeStatements).not.toContain('user_role');
  });

  it('scopes every policy to authenticated', () => {
    // Not cosmetic: has_permission(text) has EXECUTE revoked from anon
    // (20260829100200), so a policy with no TO clause applies to PUBLIC
    // including anon and turns an unauthenticated query into a 500
    // ("permission denied for function has_permission") rather than an empty
    // result set.
    expect((activeSql.match(/ TO authenticated\n/g) ?? []).length).toBe(15);
  });

  it('leaves unrelated policies on the same tables untouched', () => {
    for (const name of MUST_NOT_TOUCH) {
      expect(activeSql, `${name} must not be named in this migration`).not.toContain(name);
    }
  });

  it('carries a rollback block with a restoring statement for all fifteen', () => {
    expect(rollback.startsWith('-- ROLLBACK:')).toBe(true);

    for (const entry of POLICIES) {
      const statement = rollbackStatement(entry.policy);

      expect(statement, `${entry.policy} missing from the rollback block`).not.toBe('');
      // It has to restore the policy onto the same table under the same
      // command, or "rollback" means putting something else there.
      expect(statement, `${entry.policy}: wrong table or command`).toContain(
        `ON public.${entry.table} FOR ${entry.cmd}`
      );
      // And it has to restore the legacy predicate it replaced. A rollback
      // block that has drifted into restoring the *new* has_permission()
      // policy is not a rollback -- and a `toContain('profiles.role')` over
      // the whole file cannot tell the difference, because the header says
      // those words too.
      expect(statement, `${entry.policy}: no legacy predicate to restore`).toMatch(
        /role = (?:ANY \(ARRAY\['[a-z_]+'::user_role(?:, '[a-z_]+'::user_role)*\]\)|'[a-z_]+'::user_role)/
      );
      expect(statement, `${entry.policy}: restores a has_permission() call`).not.toContain(
        'has_permission'
      );
    }
  });

  it('restores each ALL/UPDATE policy to the WITH CHECK shape it actually had', () => {
    // late_fee_waivers and petty_cash_accounts were live with WITH CHECK: none
    // (Postgres defaults it to USING for a FOR ALL policy), so restoring an
    // explicit WITH CHECK on the way back would not be what was live -- even
    // though it would not change runtime behaviour.
    for (const entry of POLICIES) {
      if (entry.cmd !== 'ALL' && entry.cmd !== 'UPDATE') continue;

      const statement = rollbackStatement(entry.policy);
      const hasWithCheck = /\bWITH CHECK\b/.test(statement);

      expect(hasWithCheck, `${entry.policy}: wrong WITH CHECK shape on the restored policy`).toBe(
        PRIOR_HAS_WITH_CHECK[entry.policy]
      );
    }
  });

  it('has no executable SQL outside the transaction', () => {
    // Every content assertion in this file is anchored to the BEGIN;..COMMIT;
    // slice, so a statement parked above BEGIN; or below COMMIT; would be
    // applied by psql and seen by none of them.
    const outside = migration.replace(activeSql, '').replace(/--[^\n]*/g, '');

    expect(outside).not.toContain(';');
  });

  it('every permission it names is a real entry in the permission catalogue', () => {
    // Guards against a typo'd permission string, which would produce a policy
    // that compiles, applies, and denies everyone forever -- has_permission()
    // returns false for a name no role can hold. Also guards the specific
    // documented hazard for this slice: `finance.manage_expenditure` does not
    // exist, only the bare `manage_expenditure` does.
    const catalogue = new Set<string>(Object.values(PERMISSIONS));
    const unknown = [...new Set(POLICIES.map((p) => p.permission))].filter(
      (p) => !catalogue.has(p)
    );

    expect(unknown).toEqual([]);
    expect(POLICIES.find((p) => p.table === 'petty_cash_accounts')?.permission).toBe(
      'manage_expenditure'
    );
  });
});
