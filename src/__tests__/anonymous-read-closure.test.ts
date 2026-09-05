import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #212, first half. Six tables were confirmed -- by real unauthenticated
 * HTTP request against the live database, not by reading policies -- to
 * return live rows to a caller holding only the publishable anon key:
 * `system_settings` (62 rows), `billing_profiles` (5), `billing_items` (5),
 * `expense_categories` (15). `budgets` and `vendors` are exposed by the
 * identical mechanism and return 200 with zero rows only because they are
 * currently empty.
 *
 * The mechanism: each affected policy is PERMISSIVE, USING (true), granted to
 * the PUBLIC database role rather than `authenticated`. Supabase grants
 * `anon` SELECT on these tables by default, and a public-role policy applies
 * to every role including `anon`, so USING (true) resolves to unconditional
 * public read.
 *
 * The scope is 11 policies across 6 tables, not 6, and that is the trap this
 * file exists to catch. Five of these tables also carry a FOR ALL policy
 * granted to `public` whose predicate calls `get_my_role()` or reads
 * `profiles`. Re-scoping only the six SELECT policies does not shrink the
 * fix -- it introduces a new outage: once the SELECT policy no longer admits
 * `anon`, an anonymous query falls through to the still-public ALL policy,
 * and `anon` has no EXECUTE on `get_my_role()`, so the query raises
 * `42501: permission denied for function get_my_role()` -- an HTTP 500 --
 * instead of returning an empty result set. Verified against the live
 * database inside a rolled-back transaction (see the migration header).
 *
 * These are structural assertions over the migration file, not behavioural
 * ones: nothing here connects to a database, the same approach as
 * `legacy-policies-part-b.test.ts`. What it can prove is that the migration
 * as written is the migration that was reviewed -- exact policy names, exact
 * commands, exact predicates, exact grantee -- which is what a later reader
 * diffing the live policy set against
 * docs/validation/role-access-matrix.baseline.json needs.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

const MIGRATION_FILE = '20260905003000_close_anonymous_table_reads.sql';

/**
 * Normalised to LF because the assertions below match multi-line CREATE
 * POLICY blocks literally, and a CRLF checkout on Windows would otherwise
 * fail every one of them for a reason that has nothing to do with the
 * policy.
 */
const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the old
 * `TO public` grants -- so a check for `TO public` that scanned the whole
 * file could never pass, and one that scanned nothing would never fail. The
 * `^`-anchored `BEGIN;` skips the commented `-- BEGIN;` that opens the
 * rollback block.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/** Active SQL with `--` comments removed, so section prose cannot satisfy a check. */
const activeStatements = activeSql.replace(/--[^\n]*/g, '');

/**
 * The rollback block only, sliced from its own `-- ROLLBACK:` marker rather
 * than from the top of the file. Slicing from offset zero would pull in the
 * header, which names `TO public`, `get_my_role()` and the EXISTS predicate
 * in its own prose, so every assertion about the rollback block's *contents*
 * would be satisfied by the header regardless of what the rollback block
 * itself says. (This exact mistake shipped once in an earlier slice of this
 * epic -- see legacy-policies-part-b.test.ts's own comment on it.)
 */
const rollback = migration.slice(
  migration.indexOf('-- ROLLBACK:'),
  migration.indexOf('\nBEGIN;')
);

/**
 * The rollback block's restoring statement for one policy: from its
 * `-- CREATE POLICY "<name>"` line to the start of the next commented CREATE
 * POLICY, or to the block's closing `-- COMMIT;`.
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

const MANAGE_ROLES_PREDICATE =
  "EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))";

const BILLING_MANAGE_PREDICATE =
  "get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])";

/**
 * The eleven policies in scope, as `[table, policy name, command,
 * predicate]`. The predicate column is restated here rather than derived
 * from the migration so that changing the migration alone cannot make this
 * file agree with it -- the failure mode worth catching is a predicate that
 * got "simplified" or reformatted along the way, not just a missing policy.
 */
const POLICIES: ReadonlyArray<{
  table: string;
  policy: string;
  cmd: 'ALL' | 'SELECT';
  predicate: string;
}> = [
  {
    table: 'billing_items',
    policy: 'All authenticated can view billing items',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'billing_items',
    policy: 'Admins chairmen fin sec can manage billing items',
    cmd: 'ALL',
    predicate: BILLING_MANAGE_PREDICATE,
  },
  {
    table: 'billing_profiles',
    policy: 'All authenticated can view billing profiles',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'billing_profiles',
    policy: 'Admins chairmen fin sec can manage billing profiles',
    cmd: 'ALL',
    predicate: BILLING_MANAGE_PREDICATE,
  },
  {
    table: 'budgets',
    policy: 'View Budgets - Admins/Financial Secretary',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'budgets',
    policy: 'Manage Budgets - Authorized Roles',
    cmd: 'ALL',
    predicate: MANAGE_ROLES_PREDICATE,
  },
  {
    table: 'expense_categories',
    policy: 'View Categories - Admins/Financial Secretary',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'expense_categories',
    policy: 'Manage Categories - Authorized Roles',
    cmd: 'ALL',
    predicate: MANAGE_ROLES_PREDICATE,
  },
  {
    table: 'system_settings',
    policy: 'system_settings_select_policy',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'vendors',
    policy: 'View Vendors - Admins/Financial Secretary',
    cmd: 'SELECT',
    predicate: 'true',
  },
  {
    table: 'vendors',
    policy: 'Manage Vendors - Authorized Roles',
    cmd: 'ALL',
    predicate: MANAGE_ROLES_PREDICATE,
  },
];

/** The exact `CREATE POLICY` text the migration is pinned to. */
function expectedCreate(entry: (typeof POLICIES)[number]): string {
  const head = `CREATE POLICY "${entry.policy}"\n  ON public.${entry.table} FOR ${entry.cmd} TO authenticated`;
  return `${head}\n  USING (${entry.predicate});`;
}

describe('#212 (part 1): close anonymous reads on six finance/settings tables', () => {
  it('the migration exists under the agreed filename', () => {
    // Pinned by exact name, not by suffix match: the applied-migrations
    // record is keyed on the filename, and a rename after review is how a
    // migration ends up applied twice or not at all.
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('sorts after the other 20260905 migrations', () => {
    const siblings = readdirSync(migrationsDir)
      .filter((f) => f.startsWith('20260905'))
      .sort();
    expect(siblings.length).toBeGreaterThanOrEqual(4);
    expect(siblings[siblings.length - 1]).toBe(MIGRATION_FILE);
  });

  it('wraps its work in a single transaction', () => {
    // All eleven policies land or none do.
    expect(activeSql).not.toBe('');
    expect((migration.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
  });

  it.each(POLICIES)('re-scopes "$policy" on $table to authenticated, predicate unchanged', (entry) => {
    // The DROP must name the same policy as the CREATE -- recreating under a
    // new name would leave the old public-role policy live alongside the
    // new one, and RLS policies are OR-ed, so anon would still get through.
    expect(activeSql).toContain(
      `DROP POLICY IF EXISTS "${entry.policy}" ON public.${entry.table};`
    );
    expect(activeSql).toContain(expectedCreate(entry));
  });

  it('names exactly these eleven policies and no others', () => {
    // Counting is what makes the per-policy checks above sufficient: without
    // it, a twelfth DROP POLICY outside this slice's scope would pass every
    // other assertion in this file.
    const dropped = [...activeSql.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.(\w+);/g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const created = [...activeSql.matchAll(/CREATE POLICY "([^"]+)"\n  ON public\.(\w+) /g)].map(
      (m) => `${m[2]}.${m[1]}`
    );
    const expected = POLICIES.map((p) => `${p.table}.${p.policy}`);

    expect(dropped).toEqual(expected);
    expect(created).toEqual(expected);
    expect((activeSql.match(/DROP POLICY/g) ?? []).length).toBe(11);
    expect((activeSql.match(/CREATE POLICY/g) ?? []).length).toBe(11);
  });

  it('every DROP is re-runnable and precedes its own CREATE', () => {
    for (const entry of POLICIES) {
      const dropAt = activeSql.indexOf(`DROP POLICY IF EXISTS "${entry.policy}"`);
      const createAt = activeSql.indexOf(`CREATE POLICY "${entry.policy}"`);
      expect(dropAt, `${entry.policy}: DROP not found`).toBeGreaterThan(-1);
      expect(dropAt, `${entry.policy}: DROP must precede CREATE`).toBeLessThan(createAt);
    }
  });

  it('scopes every active policy to authenticated and none to public', () => {
    // Not cosmetic: the whole point of the migration. A stray `TO public`
    // left on any of the eleven would leave that table's anonymous hole (or
    // its get_my_role() 500 trap) open.
    expect((activeSql.match(/ TO authenticated\n/g) ?? []).length).toBe(11);
    expect(activeStatements).not.toContain('TO public');
  });

  it('does not gate any of these tables on has_permission()', () => {
    // system_settings must stay readable by every signed-in account, not
    // just admins (src/middleware.ts:92 reads maintenance_mode on
    // essentially every request). The same "keep the predicate exactly as
    // it is" rule applies to the other five tables in this slice -- none of
    // them should have grown a has_permission() gate as a drive-by.
    expect(activeStatements).not.toContain('has_permission(');
  });

  it('keeps system_settings readable by USING (true), not narrowed', () => {
    expect(activeSql).toContain(
      'CREATE POLICY "system_settings_select_policy"\n  ON public.system_settings FOR SELECT TO authenticated\n  USING (true);'
    );
  });

  it('leaves the system_settings write policies untouched', () => {
    // Only one public-role policy exists on this table; its
    // INSERT/UPDATE/DELETE policies are already TO authenticated and are not
    // part of this slice's 11.
    const settingsDrops = [...activeSql.matchAll(/DROP POLICY IF EXISTS "([^"]+)" ON public\.system_settings;/g)].map(
      (m) => m[1]
    );
    expect(settingsDrops).toEqual(['system_settings_select_policy']);
  });

  it('carries a rollback block with a restoring statement for all eleven', () => {
    expect(rollback.startsWith('-- ROLLBACK:')).toBe(true);

    for (const entry of POLICIES) {
      const statement = rollbackStatement(entry.policy);

      expect(statement, `${entry.policy} missing from the rollback block`).not.toBe('');
      // Restores onto the same table under the same command, or "rollback"
      // means putting something else there.
      expect(statement, `${entry.policy}: wrong table or command`).toContain(
        `ON public.${entry.table} FOR ${entry.cmd}`
      );
      // Restores the exact predicate that was live, not the has_permission()
      // convention this epic uses elsewhere.
      expect(statement, `${entry.policy}: wrong predicate restored`).toContain(
        `USING (${entry.predicate});`
      );
    }
  });

  it('restores every rollback policy with TO public, matching what was live', () => {
    // The point of the rollback is to restore what was actually live, not
    // what would merely undo the migration's intent. A prior slice in this
    // epic shipped a rollback block whose TO clause was never tested and
    // would have restored the wrong grantee -- this pins it directly.
    for (const entry of POLICIES) {
      const statement = rollbackStatement(entry.policy);
      expect(statement, `${entry.policy}: rollback missing TO public`).toContain('TO public');
      expect(statement, `${entry.policy}: rollback must not say TO authenticated`).not.toContain(
        'TO authenticated'
      );
    }
    expect((rollback.match(/ TO public\n/g) ?? []).length).toBe(11);
  });

  it('has no executable SQL outside the transaction', () => {
    const outside = migration.replace(activeSql, '').replace(/--[^\n]*/g, '');
    expect(outside).not.toContain(';');
  });
});
