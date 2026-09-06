import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issues #214 and #213 (epic #182) drop the last four RLS policies that read
 * the legacy `profiles.role` column. They are the remaining hard dependents of
 * that column: while any of them exists, `ALTER TABLE public.profiles DROP
 * COLUMN role` -- the whole of #194, the epic's final slice -- fails with
 * 2BP01. `DROP COLUMN ... CASCADE` would clear them, and is forbidden: it
 * deletes live authorization policies leaving no record of what went.
 *
 * These are structural assertions over the migration file, not behavioural
 * ones: nothing here connects to a database, the same approach as
 * `legacy-policies-part-a.test.ts`, `legacy-policies-part-b.test.ts` and
 * `legacy-role-migration-ratchet.test.ts`. What it can prove is that the
 * migration as written is the migration that was reviewed -- exactly four
 * drops, exactly those four names, nothing else touched.
 *
 * Two failure modes drive the assertion set, because both are silent:
 *
 *   1. **The wrong two policies go from the AI tables.** Each of those tables
 *      carries clean sibling policies that must survive, and `DROP POLICY IF
 *      EXISTS` on a name nobody meant to touch succeeds without a word. A test
 *      that only counted four drops would pass while the wrong four went, so
 *      the survivors are named explicitly below.
 *
 *   2. **A role list quietly changes.** The two report-table policies are
 *      dropped as *redundant* -- their modern RBAC siblings
 *      (`report_schedules_*`, `generated_reports_delete`) admit exactly the
 *      same three roles, because the legacy values 'admin', 'chairman' and
 *      'financial_secretary' are held by, and only by, super_admin, chairman
 *      and financial_officer (LEGACY_ROLE_MAP, src/actions/roles/assign-role.ts).
 *      An earlier reading of this slice held that the legacy policies uniquely
 *      admitted `vice_chairman` and that the siblings therefore had to be
 *      widened to preserve access. That reading was wrong: vice_chairman has no
 *      legacy equivalent, so it carries `profiles.role = NULL` and was never
 *      admitted by these policies at all. Widening the siblings would have
 *      GRANTED access rather than preserved it. This file therefore asserts
 *      that the migration contains no `ALTER POLICY` whatsoever and never
 *      names `vice_chairman` in executable SQL, so that reading cannot come
 *      back through a later edit.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const MIGRATION_FILE = '20260906020000_remove_last_legacy_role_policies.sql';

/**
 * Normalised to LF because the assertions below match multi-line statements
 * literally, and a CRLF checkout on Windows would otherwise fail every one of
 * them for a reason that has nothing to do with the policies.
 */
const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the old
 * `profiles.role` predicates -- so a check for legacy references that scanned
 * the whole file could never pass. The `^`-anchored `BEGIN;` skips the
 * commented `-- BEGIN;` that opens the rollback block.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/**
 * Active SQL with `--` comments removed.
 *
 * Load-bearing here in a way it was not in part B: this migration's header and
 * its inline comments deliberately NAME every policy that must survive, and
 * name `vice_chairman` while explaining why it is not added. Checks for "this
 * name must not appear" therefore have to run against comment-stripped SQL, or
 * the prose that documents the decision would fail the test that enforces it.
 */
const activeStatements = activeSql.replace(/--[^\n]*/g, '');

/**
 * The rollback block only, sliced from its own `-- ROLLBACK:` marker rather
 * than from the top of the file. The distinction is load-bearing and was got
 * wrong once in part A: slicing from offset zero pulls in the header, which
 * names `profiles.role` in its own prose, so every assertion about the
 * rollback block's *contents* was satisfied by the header and passed no matter
 * what the rollback block said.
 */
const rollback = migration.slice(migration.indexOf('-- ROLLBACK:'), migration.indexOf('\nBEGIN;'));

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
 * The four policies, as `[table, policy name, command]`.
 *
 * Restated here rather than derived from the migration, so that editing the
 * migration alone cannot make this file agree with it. Transcribed from the
 * 2BP01 DETAIL captured on #214 and #213 -- the database's own list of what
 * blocks the column drop -- not from the CREATE TABLE migrations.
 */
const DROPPED: ReadonlyArray<{
  table: string;
  policy: string;
  cmd: 'ALL' | 'SELECT' | 'DELETE';
}> = [
  { table: 'ai_settings', policy: 'Admins can manage AI settings', cmd: 'ALL' },
  {
    table: 'ai_conversation_logs',
    policy: 'Admins can read all conversation logs',
    cmd: 'SELECT',
  },
  {
    table: 'report_schedules',
    policy: 'Admin and financial roles can manage report schedules',
    cmd: 'ALL',
  },
  {
    table: 'generated_reports',
    policy: 'Admin and financial roles can delete generated reports',
    cmd: 'DELETE',
  },
];

/**
 * Which dropped policies were live with an explicit WITH CHECK clause, so the
 * rollback restores the shape that actually existed rather than the shape the
 * command implies. Only the FOR ALL policy on ai_settings had one; the FOR ALL
 * policy on report_schedules did not (Postgres defaults WITH CHECK to the
 * USING expression), and SELECT/DELETE policies cannot have one.
 */
const PRIOR_HAS_WITH_CHECK: Record<string, boolean> = {
  'Admins can manage AI settings': true,
  'Admins can read all conversation logs': false,
  'Admin and financial roles can manage report schedules': false,
  'Admin and financial roles can delete generated reports': false,
};

/**
 * Policies on the same four tables that must survive this migration intact.
 *
 * Named individually rather than counted, because the failure this guards
 * against is a *swap*: four drops that take the wrong names. Every count-based
 * assertion in this file passes that scenario.
 *
 * The four on the AI tables are the clean ones -- they read `is_active`,
 * `is_approved()` or `user_id = auth.uid()` and never touch `profiles.role`.
 * The five modern report siblings resolve `profiles.role_id -> app_roles.name`
 * and are what makes the two report-table drops access-preserving; dropping or
 * altering one of them would revoke real access with nothing raised anywhere.
 */
const MUST_SURVIVE: ReadonlyArray<{ table: string; policy: string }> = [
  { table: 'ai_settings', policy: 'All users can read active AI settings' },
  { table: 'ai_settings', policy: 'Approved accounts only can read' },
  { table: 'ai_conversation_logs', policy: 'Users can read their own conversation logs' },
  { table: 'ai_conversation_logs', policy: 'Users can insert their own conversation logs' },
  { table: 'report_schedules', policy: 'Authenticated users can view report schedules' },
  { table: 'report_schedules', policy: 'report_schedules_select' },
  { table: 'report_schedules', policy: 'report_schedules_insert' },
  { table: 'report_schedules', policy: 'report_schedules_update' },
  { table: 'report_schedules', policy: 'report_schedules_delete' },
  { table: 'generated_reports', policy: 'Authenticated users can view generated reports' },
  { table: 'generated_reports', policy: 'Authenticated users can insert generated reports' },
  { table: 'generated_reports', policy: 'generated_reports_delete' },
];

describe('#214 + #213: the last legacy profiles.role policies are dropped', () => {
  it('the migration exists under the agreed filename', () => {
    // Pinned by exact name, not by suffix match: the applied-migrations record
    // is keyed on the filename, and a rename after review is how a migration
    // ends up applied twice or not at all. The timestamp was assigned by the
    // coordinator to guarantee ordering against migrations being written
    // concurrently in sibling worktrees.
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('sorts after every migration epic #182 has already landed', () => {
    // #192's reconciliation guard (20260905010000) reads profiles.role one last
    // time to prove no account still needs it. This migration removes the last
    // policies reading that column, and #194 then drops it. Applying this one
    // first would not break #192, but the file order is the epic's audit trail
    // and a later reader reconstructs the sequence from it.
    const siblings = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    const reconcile = '20260905010000_reconcile_profile_role_ids.sql';

    expect(siblings).toContain(reconcile);
    expect(siblings.indexOf(MIGRATION_FILE)).toBeGreaterThan(siblings.indexOf(reconcile));
  });

  it('wraps its work in a single transaction', () => {
    // All four policies go or none do. A partial apply leaves #194 still
    // blocked by whichever survived, with nothing to say which.
    expect(activeSql).not.toBe('');
    expect((migration.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
  });

  it.each(DROPPED)('drops "$policy" from $table', (entry) => {
    expect(activeStatements).toContain(
      `DROP POLICY IF EXISTS "${entry.policy}" ON public.${entry.table};`
    );
  });

  it('names exactly these four policies and no others', () => {
    // Counting is what makes the per-policy checks above sufficient: without
    // it, a fifth DROP POLICY for something outside this slice's scope would
    // pass every other assertion in this file.
    const dropped = [
      ...activeStatements.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+);/g),
    ].map((m) => `${m[2]}.${m[1]}`);
    const expected = DROPPED.map((d) => `${d.table}.${d.policy}`);

    expect(dropped).toEqual(expected);
    expect((activeStatements.match(/DROP POLICY/g) ?? []).length).toBe(4);
  });

  it('drops nothing else and creates nothing', () => {
    // The migration's entire job is removal. A CREATE POLICY here would mean a
    // replacement policy was smuggled in past the owner's decision on #214 --
    // which was explicitly "drop them, do not replace them", after inventing an
    // `ai.*` permission to preserve them was considered and rejected.
    expect(activeStatements).not.toContain('CREATE POLICY');
    expect(activeStatements).not.toContain('DROP TABLE');
    expect(activeStatements).not.toContain('ALTER TABLE');
  });

  it('contains no ALTER POLICY at all', () => {
    // The load-bearing assertion of this file. An earlier, incorrect reading of
    // this slice held that the two report-table policies uniquely admitted
    // vice_chairman, and would have had this migration ALTER the five modern
    // sibling policies to add it. vice_chairman carries profiles.role = NULL
    // (it has no entry in LEGACY_ROLE_MAP, src/actions/roles/assign-role.ts),
    // so it was never admitted by a policy reading that column: adding it would
    // have GRANTED access, not preserved it.
    //
    // Asserting the absence of the whole statement kind -- rather than the
    // absence of the string 'vice_chairman' alone -- also catches the general
    // case: any silent change to a surviving policy's expression, command or
    // role list.
    expect(activeStatements).not.toContain('ALTER POLICY');
    expect(activeStatements).not.toMatch(/\bALTER\s+POLICY\b/i);
  });

  it('names no role in executable SQL', () => {
    // Corollary of the above, checked directly. If a role name appears in the
    // executable body of a migration whose only job is four DROP POLICY
    // statements, something is granting or revoking access.
    for (const role of [
      'vice_chairman',
      'super_admin',
      'chairman',
      'financial_officer',
      'security_officer',
    ]) {
      expect(activeStatements, `${role} must not appear in executable SQL`).not.toContain(role);
    }
  });

  it('leaves every clean policy on the four tables untouched', () => {
    // The swap guard. `DROP POLICY IF EXISTS` on a name nobody meant to touch
    // succeeds silently, so dropping the wrong four would raise nothing at
    // apply time and would be invisible to a count-only test.
    for (const { table, policy } of MUST_SURVIVE) {
      expect(
        activeStatements,
        `${table}."${policy}" must not be named in this migration`
      ).not.toContain(policy);
    }
  });

  it('uses no CASCADE anywhere in the executable SQL', () => {
    // The forbidden shortcut, in both its forms: DROP POLICY ... CASCADE, and
    // the DROP COLUMN ... CASCADE that #194 must also avoid. CASCADE would
    // clear these dependents without ever naming them, which is exactly what
    // the rollback block below exists to prevent.
    expect(activeStatements).not.toContain('CASCADE');
    expect(activeStatements.toUpperCase()).not.toContain('CASCADE');
  });

  it('every DROP is re-runnable', () => {
    // IF EXISTS is what keeps a second apply from aborting with 42704 (policy
    // does not exist) partway through, leaving the transaction rolled back and
    // the operator unsure what state they are in.
    expect((activeStatements.match(/DROP POLICY IF EXISTS/g) ?? []).length).toBe(4);
  });

  it('no executable statement reads the legacy profiles.role column', () => {
    // Checked against comment-stripped active SQL so that neither the header
    // nor the rollback block can mask a real reference in the body.
    expect(activeStatements).not.toContain('profiles.role');
    expect(activeStatements).not.toContain('user_role');
    expect(activeStatements).not.toMatch(/\brole\s*=\s*ANY\b/i);
  });

  it('carries a rollback block with a restoring statement for all four', () => {
    expect(rollback.startsWith('-- ROLLBACK:')).toBe(true);

    for (const entry of DROPPED) {
      const statement = rollbackStatement(entry.policy);

      expect(statement, `${entry.policy} missing from the rollback block`).not.toBe('');
      // It has to restore the policy onto the same table under the same
      // command, or "rollback" means putting something else there.
      expect(statement, `${entry.policy}: wrong table or command`).toContain(
        `ON public.${entry.table} FOR ${entry.cmd}`
      );
      // And it has to restore the legacy predicate it replaced. A rollback
      // block that has drifted into restoring something else is not a
      // rollback -- and a toContain('profiles.role') over the whole file cannot
      // tell the difference, because the header says those words too.
      expect(statement, `${entry.policy}: no legacy predicate to restore`).toMatch(
        /role = ANY \(ARRAY\['[a-z_]+'::user_role(?:, '[a-z_]+'::user_role)*\]\)/
      );
      expect(statement, `${entry.policy}: restores all three legacy roles`).toContain(
        "'admin'::user_role"
      );
      expect(statement, `${entry.policy}: restores all three legacy roles`).toContain(
        "'chairman'::user_role"
      );
      expect(statement, `${entry.policy}: restores all three legacy roles`).toContain(
        "'financial_secretary'::user_role"
      );
    }
  });

  it('restores every policy with TO authenticated', () => {
    // All four were verified live as {authenticated}. That uniformity is
    // exactly what makes it easy to lose silently -- restoring one as TO public
    // would widen it to anon, and no other assertion in this file would notice.
    for (const entry of DROPPED) {
      const statement = rollbackStatement(entry.policy);
      expect(statement, `${entry.policy}: rollback missing TO authenticated`).toContain(
        'TO authenticated'
      );
      expect(statement, `${entry.policy}: rollback must not restore as TO public`).not.toContain(
        'TO public'
      );
    }
    expect((rollback.match(/ TO authenticated\n/g) ?? []).length).toBe(4);
  });

  it('restores each policy with the WITH CHECK shape it actually had', () => {
    // "Admins can manage AI settings" was live with both clauses; the FOR ALL
    // policy on report_schedules had USING only (Postgres defaults WITH CHECK
    // to the USING expression). Adding an explicit WITH CHECK on the way back
    // would not change runtime behaviour, but it would not be what was live.
    for (const entry of DROPPED) {
      const statement = rollbackStatement(entry.policy);
      const hasWithCheck = /\bWITH CHECK\b/.test(statement);

      expect(hasWithCheck, `${entry.policy}: wrong WITH CHECK shape on the restored policy`).toBe(
        PRIOR_HAS_WITH_CHECK[entry.policy]
      );
    }
  });

  it('the rollback block restores nothing beyond the four dropped policies', () => {
    // A rollback that recreates a fifth policy would, on use, add something
    // that was never there -- the mirror image of the swap guard above.
    const restored = [...rollback.matchAll(/-- CREATE POLICY "([^"]+)"/g)].map((m) => m[1]);

    expect(restored).toEqual(DROPPED.map((d) => d.policy));
  });

  it('has no executable SQL outside the transaction', () => {
    // Every content assertion in this file is anchored to the BEGIN;..COMMIT;
    // slice, so a statement parked above BEGIN; or below COMMIT; would be
    // applied by psql and seen by none of them.
    const outside = migration.replace(activeSql, '').replace(/--[^\n]*/g, '');

    expect(outside).not.toContain(';');
  });
});
