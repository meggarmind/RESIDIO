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

/** Whitespace-collapsed SQL. `pg_policies` wraps `qual` and `with_check`
 * across lines and the rollback block does not, so both sides are flattened
 * before any comparison rather than one being reformatted to suit the other. */
function flatten(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

/**
 * One clause's predicate, lifted out of a commented rollback statement:
 * `--` prefixes stripped, whitespace collapsed, truncated at the statement
 * terminator so the trailing comment lines cannot leak in.
 *
 * Returned as the WHOLE predicate on purpose. The corruptions that matter
 * here append to a predicate rather than replace it, so every assertion that
 * merely finds a fragment inside one is satisfied by the corrupted version.
 */
function clausePredicate(clauseText: string, keyword: 'USING' | 'WITH CHECK'): string {
  const flat = flatten(clauseText.replace(/^[ \t]*--[ \t]?/gm, ''));
  const at = flat.indexOf(`${keyword} (`);
  if (at === -1) return '';

  const body = flat.slice(at + keyword.length);
  const terminator = body.indexOf(';');

  return (terminator === -1 ? body : body.slice(0, terminator)).trim();
}

/**
 * The exact shape a restored legacy predicate must have, end to end.
 *
 * Two spellings, because the live policies had two: the AI pair aliases the
 * table (`FROM profiles p` ... `p.id = auth.uid()`) and the report pair does
 * not (`FROM profiles` ... `profiles.id = auth.uid()`). Each alternative pins
 * three things the role-list assertions cannot see -- the relation is
 * `profiles`, the row is bound to `auth.uid()`, and the alias used in the
 * WHERE is the one the FROM actually bound -- and both are anchored `^...$`
 * so that nothing can be appended.
 */
const CALLER_BOUND_PREDICATE = new RegExp(
  '^\\(EXISTS \\( SELECT 1 FROM profiles p WHERE ' +
    '\\(\\(p\\.id = auth\\.uid\\(\\)\\) AND ' +
    '\\(p\\.role = ANY \\(ARRAY\\[[^[\\]]+\\]\\)\\)\\)\\)\\)$' +
    '|' +
    '^\\(EXISTS \\( SELECT 1 FROM profiles WHERE ' +
    '\\(\\(profiles\\.id = auth\\.uid\\(\\)\\) AND ' +
    '\\(profiles\\.role = ANY \\(ARRAY\\[[^[\\]]+\\]\\)\\)\\)\\)\\)$'
);

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
  // report_schedules carries its own "Approved accounts only can read" -- a
  // distinct policy from the ai_settings one of the same name, and present in
  // the capture. It was missing from this list (and from the migration
  // header's) until #214's second QA pass.
  { table: 'report_schedules', policy: 'Approved accounts only can read' },
  { table: 'report_schedules', policy: 'report_schedules_select' },
  { table: 'report_schedules', policy: 'report_schedules_insert' },
  { table: 'report_schedules', policy: 'report_schedules_update' },
  { table: 'report_schedules', policy: 'report_schedules_delete' },
  { table: 'generated_reports', policy: 'Authenticated users can view generated reports' },
  { table: 'generated_reports', policy: 'Authenticated users can insert generated reports' },
  { table: 'generated_reports', policy: 'generated_reports_select' },
  { table: 'generated_reports', policy: 'generated_reports_insert' },
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

      // And it has to restore the legacy predicate it replaced -- in EVERY
      // clause the policy actually had, checked separately. "Admins can
      // manage AI settings" is FOR ALL with both a USING and a WITH CHECK
      // clause; asserting over the whole statement lets either clause's
      // predicate mask a corruption of the other, because toContain and the
      // shape regex are satisfied the moment ONE clause is intact. Splitting
      // on the "WITH CHECK" marker (present only when PRIOR_HAS_WITH_CHECK
      // says it should be) and running the same checks against each half
      // closes that gap: a bad WITH CHECK predicate can no longer hide behind
      // a good USING predicate, or vice versa.
      const withCheckIndex = statement.indexOf('WITH CHECK');
      const hasWithCheck = withCheckIndex !== -1;

      expect(hasWithCheck, `${entry.policy}: WITH CHECK presence mismatch`).toBe(
        PRIOR_HAS_WITH_CHECK[entry.policy]
      );

      const clauses: ReadonlyArray<{ name: 'USING' | 'WITH CHECK'; text: string }> = hasWithCheck
        ? [
            { name: 'USING', text: statement.slice(0, withCheckIndex) },
            { name: 'WITH CHECK', text: statement.slice(withCheckIndex) },
          ]
        : [{ name: 'USING', text: statement }];

      for (const clause of clauses) {
        // ---- the caller binding ------------------------------------------
        // Splitting the clauses closed the clause-MASKING class. It did not
        // close this one: every assertion below talks about the role LIST,
        // and a predicate can keep a perfect role list while it has stopped
        // identifying the caller at all. `p.id = p.id`, `FROM app_roles p`
        // and an appended `OR true` each leave the ARRAY[...] literal
        // untouched and make the EXISTS true for every authenticated user --
        // the last of those would have the documented recovery path restore a
        // WRITE policy on ai_settings open to everyone who can log in.
        const predicate = clausePredicate(clause.text, clause.name);

        expect(
          predicate,
          `${entry.policy}: ${clause.name} clause has no predicate to check`
        ).not.toBe('');
        expect(
          predicate,
          `${entry.policy}: ${clause.name} clause does not bind the row to the caller`
        ).toMatch(/\((?:p|profiles)\.id = auth\.uid\(\)\)/);
        expect(
          predicate,
          `${entry.policy}: ${clause.name} clause does not select FROM profiles`
        ).toMatch(/ SELECT 1 FROM profiles(?: p)? WHERE /);
        expect(
          (predicate.match(/EXISTS/g) ?? []).length,
          `${entry.policy}: ${clause.name} clause is not a single EXISTS`
        ).toBe(1);
        expect(
          predicate,
          `${entry.policy}: ${clause.name} clause carries a disjunct`
        ).not.toMatch(/\bOR\b/i);
        // Anchored end to end. The three fragment checks above are each
        // satisfied by `<good predicate> OR true`; only whole-shape equality
        // rejects it.
        expect(
          predicate,
          `${entry.policy}: ${clause.name} clause is not the exact caller-bound EXISTS shape`
        ).toMatch(CALLER_BOUND_PREDICATE);

        // A toContain('profiles.role') over the whole file cannot tell a
        // faithful rollback from a drifted one, because the header says
        // those words too -- hence matching against this one clause only.
        expect(
          clause.text,
          `${entry.policy}: ${clause.name} clause has no legacy predicate to restore`
        ).toMatch(/role = ANY \(ARRAY\['[a-z_]+'::user_role(?:, '[a-z_]+'::user_role)*\]\)/);
        expect(
          clause.text,
          `${entry.policy}: ${clause.name} clause must restore all three legacy roles`
        ).toContain("'admin'::user_role");
        expect(
          clause.text,
          `${entry.policy}: ${clause.name} clause must restore all three legacy roles`
        ).toContain("'chairman'::user_role");
        expect(
          clause.text,
          `${entry.policy}: ${clause.name} clause must restore all three legacy roles`
        ).toContain("'financial_secretary'::user_role");
        // The three toContain checks above pass just as well with a FOURTH
        // role quietly added -- 'security_officer'::user_role was never
        // admitted by these legacy policies, so restoring it would widen
        // access on the way back. Extracting the literal role list out of
        // the clause's own ARRAY[...] and comparing it for exact equality
        // (order-independent) is what catches that a toContain-only check
        // cannot.
        const restoredRoles = [...clause.text.matchAll(/'([a-z_]+)'::user_role/g)]
          .map((m) => m[1])
          .sort();
        expect(
          restoredRoles,
          `${entry.policy}: ${clause.name} clause restores the wrong exact role set`
        ).toEqual(['admin', 'chairman', 'financial_secretary']);
      }
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

/**
 * Evidence for the migration's "NO access change at all" claim about the two
 * report-table drops: that report_schedules and generated_reports already
 * carry modern, `role_id`-keyed sibling policies admitting exactly the same
 * three roles the dropped legacy policies admitted.
 *
 * That claim cannot be checked against `supabase/migrations/` on its own --
 * RLS policies that exist live are not reproduced there (already-filed
 * defect #228), so the sibling policies' predicates and role lists live only
 * in the database. `docs/validation/last-legacy-role-siblings.json` is a
 * `pg_policies` capture of all 19 policies on the four affected tables, taken
 * from the live cloud database on 2026-09-06 for exactly this reason. These
 * tests assert the sibling-coverage claim against that capture, rather than
 * trusting the migration header's prose.
 */
describe('#214 evidence: modern siblings cover what the legacy report policies dropped', () => {
  const captureDir = fileURLToPath(new URL('../../docs/validation', import.meta.url));
  const CAPTURE_FILE = 'last-legacy-role-siblings.json';

  interface CapturedPolicy {
    cmd: string;
    policyname: string;
    qual: string;
    roles: string;
    tablename: string;
    with_check: string;
  }

  const capture = JSON.parse(
    readFileSync(path.join(captureDir, CAPTURE_FILE), 'utf8')
  ) as {
    policies: CapturedPolicy[];
    policyCount: number;
  };

  /**
   * The role set the modern siblings are asserted to admit, per the migration
   * header: `super_admin, chairman, financial_officer`, resolved through
   * `profiles.role_id -> app_roles.name`. Order-independent on purpose --
   * the comparison below sorts both sides -- so a capture whose ARRAY[...]
   * literal is reordered does not fail this test for a reason that has
   * nothing to do with coverage.
   */
  const MODERN_ROLE_SET = ['chairman', 'financial_officer', 'super_admin'];

  /** The predicate that actually governs the command: Postgres has no USING
   * clause on INSERT, so INSERT policies carry their role check in
   * `with_check` while every other command here carries it in `qual`. */
  function governingPredicate(policy: CapturedPolicy): string {
    return policy.cmd === 'INSERT' ? policy.with_check : policy.qual;
  }

  /**
   * Extracts the literal role names an
   * `(ar.name)::text = ANY ((ARRAY[...])::text[])` predicate admits, sorted
   * so ordering differences in the capture cannot fail the comparison.
   *
   * Read out of that comparison ITSELF, not out of the predicate at large.
   * Scanning the whole predicate for `'x'::character varying` literals cannot
   * tell which column is being compared, so a predicate that keeps the join
   * and the role list but tests the wrong column -- `(p.nickname)::text = ANY
   * (...)` -- still reported the correct role set. Anchoring the extraction
   * on `(ar.name)::text` makes such a predicate yield nothing and fail.
   */
  function rolesIn(predicate: string): string[] {
    const comparison = predicate.match(
      /\(ar\.name\)::text = ANY \(\(ARRAY\[([^[\]]*)\]\)::text\[\]\)/
    );
    if (!comparison) return [];

    return [...comparison[1].matchAll(/'([a-z_]+)'::character varying/g)].map((m) => m[1]).sort();
  }

  function findSibling(table: string, cmd: string, name: string): CapturedPolicy | undefined {
    return capture.policies.find(
      (p) => p.tablename === table && p.cmd === cmd && p.policyname === name
    );
  }

  it('the capture is the live pg_policies evidence the migration header points to', () => {
    expect(readdirSync(captureDir)).toContain(CAPTURE_FILE);
    expect(Array.isArray(capture.policies)).toBe(true);
    expect(capture.policies.length).toBeGreaterThan(0);
    // policyCount is the capture's own claim about how many rows it holds. Left
    // unasserted it is decoration: a capture truncated on its way into the repo
    // keeps the count of the complete one and reads as complete.
    expect(capture.policies.length, 'policyCount disagrees with the rows captured').toBe(
      capture.policyCount
    );
  });

  it('the four policies the migration drops DO appear in the capture', () => {
    // If the capture were describing a different live state than the
    // migration, the coverage claim it evidences below would be worthless.
    for (const entry of DROPPED) {
      const row = capture.policies.find(
        (p) => p.tablename === entry.table && p.policyname === entry.policy
      );
      expect(row, `${entry.table}."${entry.policy}" is missing from the capture`).toBeDefined();
    }
  });

  it('the capture and the rollback block agree on all four dropped policies', () => {
    // The capture and the rollback block are two independent transcriptions of
    // the same four live policies, and each was trusted on its own: the capture
    // rows were checked for PRESENCE only, and the rollback block against
    // constants restated at the top of this file. Comparing the two makes each
    // the evidence for the other, so a transcription that drifts in EITHER
    // direction fails -- which neither check could do alone.
    for (const entry of DROPPED) {
      const row = capture.policies.find(
        (p) => p.tablename === entry.table && p.policyname === entry.policy
      );
      expect(row, `${entry.table}."${entry.policy}" is missing from the capture`).toBeDefined();

      const statement = rollbackStatement(entry.policy);
      expect(statement, `${entry.policy}: missing from the rollback block`).not.toBe('');

      // Command and grantee, asserted on both sides rather than on one.
      expect(row!.cmd, `${entry.policy}: capture cmd disagrees with DROPPED`).toBe(entry.cmd);
      expect(statement, `${entry.policy}: rollback cmd disagrees with the capture`).toContain(
        `ON public.${entry.table} FOR ${row!.cmd}`
      );
      expect(row!.roles, `${entry.policy}: capture grantee is not {authenticated}`).toBe(
        '{authenticated}'
      );
      expect(statement, `${entry.policy}: rollback grantee disagrees with the capture`).toContain(
        'TO authenticated'
      );

      // Predicates, clause by clause, as flattened text.
      const withCheckIndex = statement.indexOf('WITH CHECK');
      const usingText = withCheckIndex === -1 ? statement : statement.slice(0, withCheckIndex);

      expect(
        clausePredicate(usingText, 'USING'),
        `${entry.policy}: rollback USING predicate differs from the live capture`
      ).toBe(flatten(row!.qual));

      const capturedWithCheck = flatten(row!.with_check ?? '');

      expect(
        capturedWithCheck !== '',
        `${entry.policy}: capture WITH CHECK presence disagrees with PRIOR_HAS_WITH_CHECK`
      ).toBe(PRIOR_HAS_WITH_CHECK[entry.policy]);

      if (capturedWithCheck !== '') {
        expect(
          clausePredicate(statement.slice(withCheckIndex), 'WITH CHECK'),
          `${entry.policy}: rollback WITH CHECK predicate differs from the live capture`
        ).toBe(capturedWithCheck);
      }
    }
  });

  it.each([
    ['report_schedules', 'SELECT', 'report_schedules_select'],
    ['report_schedules', 'INSERT', 'report_schedules_insert'],
    ['report_schedules', 'UPDATE', 'report_schedules_update'],
    ['report_schedules', 'DELETE', 'report_schedules_delete'],
    ['generated_reports', 'DELETE', 'generated_reports_delete'],
  ] as const)(
    'sibling %s.%s ("%s") resolves role_id through app_roles to exactly the modern role set',
    (table, cmd, name) => {
      const sibling = findSibling(table, cmd, name);
      expect(sibling, `${table}.${name} (${cmd}) missing from the capture`).toBeDefined();

      const predicate = governingPredicate(sibling!);

      // "Resolves role_id through app_roles" as a join that actually executes,
      // not as the word `app_roles` appearing somewhere in the text. Substring
      // checks for 'app_roles' and 'p.role_id = ar.id' are BOTH satisfied by
      // `JOIN not_app_roles_at_all ar /* app_roles */ ON ((p.role_id = ar.id))`,
      // which binds `ar` to an entirely different relation.
      expect(predicate, `${table}.${name}: does not JOIN app_roles on role_id`).toMatch(
        /JOIN app_roles ar ON \(\(p\.role_id = ar\.id\)\)/
      );
      // And the column compared has to be the joined role's NAME. With the join
      // intact and the role literals untouched, swapping `(ar.name)::text` for
      // some other varchar column leaves every other check here green while the
      // policy admits on the wrong thing.
      expect(predicate, `${table}.${name}: does not compare (ar.name)::text`).toMatch(
        /\(ar\.name\)::text = ANY \(\(ARRAY\[/
      );
      // And the row has to be bound to the caller, for the same reason the
      // rollback clauses are checked for it above.
      expect(predicate, `${table}.${name}: does not bind the row to the caller`).toContain(
        '(p.id = auth.uid())'
      );

      expect(rolesIn(predicate), `${table}.${name}: wrong role set`).toEqual(MODERN_ROLE_SET);
    }
  );

  it('report_schedules siblings cover every command the dropped ALL policy carried', () => {
    // "Admin and financial roles can manage report schedules" was FOR ALL --
    // SELECT, INSERT, UPDATE and DELETE all have to be covered individually,
    // or "redundant" is true for only part of what was dropped.
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const) {
      const found = capture.policies.some(
        (p) => p.tablename === 'report_schedules' && p.cmd === cmd && p.policyname.startsWith('report_schedules_')
      );
      expect(found, `report_schedules: no modern sibling covers ${cmd}`).toBe(true);
    }
  });

  it('generated_reports has a modern DELETE sibling covering the dropped DELETE policy', () => {
    const sibling = findSibling('generated_reports', 'DELETE', 'generated_reports_delete');
    expect(sibling).toBeDefined();
  });

  it('therefore each dropped policy is covered, per command, by a surviving sibling', () => {
    // The conclusion the migration header draws, restated as one assertion
    // over the same capture rather than left to be inferred from the four
    // above: every (table, command) the legacy policies governed has at
    // least one surviving modern sibling admitting the same role set.
    const legacyCommands: ReadonlyArray<{ table: string; cmd: string }> = [
      { table: 'report_schedules', cmd: 'SELECT' },
      { table: 'report_schedules', cmd: 'INSERT' },
      { table: 'report_schedules', cmd: 'UPDATE' },
      { table: 'report_schedules', cmd: 'DELETE' },
      { table: 'generated_reports', cmd: 'DELETE' },
    ];

    for (const { table, cmd } of legacyCommands) {
      const covering = capture.policies.filter(
        (p) =>
          p.tablename === table &&
          p.cmd === cmd &&
          p.policyname !== 'Admin and financial roles can manage report schedules' &&
          p.policyname !== 'Admin and financial roles can delete generated reports' &&
          rolesIn(governingPredicate(p)).length === MODERN_ROLE_SET.length &&
          rolesIn(governingPredicate(p)).every((r, i) => r === MODERN_ROLE_SET[i])
      );

      expect(covering.length, `${table}.${cmd}: no covering sibling with the modern role set`).toBeGreaterThan(
        0
      );
    }
  });
});
