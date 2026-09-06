import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards #194, the final slice of epic #182 ("Remove the legacy role
 * vocabulary"): the migration that drops `profiles.role_deprecated_do_not_use`,
 * the `user_role` enum and `get_my_role()`, plus the application scaffolding
 * that named them.
 *
 * WHY EACH ASSERTION EXISTS
 *
 * The migration is destructive and irreversible for data, so the structure that
 * makes it *safe* is the thing worth pinning:
 *
 * - **The gate.** `plpgsql` is late-bound: `ALTER TABLE ... DROP COLUMN`
 *   SUCCEEDS while a function body still references the column, and the
 *   breakage surfaces weeks later as a runtime 42703 inside an unrelated
 *   feature. `pg_depend` cannot see it. The `DO $$ ... RAISE EXCEPTION $$`
 *   block that queries `pg_proc` and `pg_policies` is the only thing turning
 *   that silent failure into a refusal to migrate. Delete it and the migration
 *   still runs — which is exactly why a test has to hold it in place.
 *
 * - **The order.** `get_my_role()` RETURNS `user_role`, and the column is OF
 *   `user_role`. Both must go before `DROP TYPE`, or the type drop is refused
 *   and the whole transaction rolls back. A reordering is not a style question.
 *
 * - **The rollback block, and its honesty.** A rollback comment that implies a
 *   clean revert is worse than none: it invites someone to run it and believe
 *   the legacy values came back. They did not; `DROP COLUMN` destroys them.
 *
 * - **The filename.** Migrations apply in filename order. `20260906040000` must
 *   sort after #193's `20260906030000`, which is what renames the column this
 *   file drops. Sorting earlier means dropping a column that does not exist yet.
 *
 * The app-side assertions are ratchets in the same spirit as
 * `legacy-role-migration-ratchet.test.ts`: the vocabulary is gone from the
 * database, so it must not creep back into TypeScript, and the epic's own
 * verification probe must not go on writing a column that no longer exists.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');

const MIGRATION_FILE = '20260906040000_drop_legacy_role_column.sql';
const RENAME_MIGRATION_FILE = '20260906030000_rename_profiles_role_column.sql';

const lf = (s: string) => s.replace(/\r\n/g, '\n');

const migration = lf(readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8'));

/** The migration with `--` comments stripped, i.e. only what Postgres executes. */
const executable = migration
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');

const readSrc = (relative: string) =>
  lf(readFileSync(path.join(repoRoot, relative), 'utf8'));

/**
 * TypeScript with comments removed.
 *
 * The removal notes left behind in these files name what they removed — that is
 * the point of a removal note, and the next reader searching for `UserRole`
 * deserves to land on the explanation. So the ratchets below run against
 * executable code only: a mention in prose is history, a mention in code is the
 * vocabulary coming back. (None of these files contain a `://`, so the naive
 * line-comment strip is safe here.)
 */
const stripTsComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const readSrcCode = (relative: string) => stripTsComments(readSrc(relative));

// =============================================================================
// The migration file itself
// =============================================================================

describe('#194 migration: file identity and ordering', () => {
  it('exists under the timestamp the epic assigned it', () => {
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('sorts after #193, which is what renames the column this migration drops', () => {
    const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));

    expect(migrations).toContain(RENAME_MIGRATION_FILE);
    expect(MIGRATION_FILE > RENAME_MIGRATION_FILE).toBe(true);
  });

  it('is the last migration in the directory', () => {
    const migrations = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    expect(migrations[migrations.length - 1]).toBe(MIGRATION_FILE);
  });
});

/**
 * The gate as Postgres sees it: the DO block with `--` comments already gone.
 *
 * Naming the catalogues is not the same as querying them correctly. The
 * assertions below exist because each of these mutations left every
 * vocabulary check passing while gutting the gate:
 *
 *   - widening the regex literal to `'role_deprecated_do_not_use_XYZ'` — the
 *     substring is still present, so a `toMatch(/role_deprecated_do_not_use/)`
 *     is satisfied, but the query now matches nothing and the migration
 *     proceeds unconditionally;
 *   - inverting `IS NOT NULL` to `IS NULL` — the gate then aborts on a clean
 *     database and waves offenders through;
 *   - downgrading one branch's `RAISE EXCEPTION` to `RAISE NOTICE` — half the
 *     gate becomes a log line while "at least one RAISE EXCEPTION" still holds;
 *   - adding `CASCADE` to a drop (asserted further down, over the whole
 *     executable file) — the absence of CASCADE is what makes a surviving
 *     view, index, constraint or trigger dependency fail loudly instead of
 *     being silently removed.
 *
 * So the assertions pin what the gate DOES: its polarity, that each branch
 * aborts on its own, and the exact literal it matches on.
 */
const gate = executable.match(/DO\s+\$gate\$[\s\S]*?\$gate\$\s*;/)?.[0] ?? '';

/**
 * The two guarded branches, `IF <var> IS NOT NULL THEN ... END IF;`, captured
 * one by one. Asserting over the block as a whole cannot tell one live branch
 * and one downgraded branch apart from two live ones.
 */
const gateBranches = [
  ...gate.matchAll(/IF\s+(offending_\w+)\s+IS\s+NOT\s+NULL\s+THEN([\s\S]*?)END\s+IF\s*;/gi),
];

describe('#194 migration: the late-binding gate', () => {
  it('wraps the gate in a DO block that raises, so the migration aborts rather than proceeding', () => {
    const doBlock = executable.match(/DO\s+\$gate\$[\s\S]*?\$gate\$\s*;/);

    expect(doBlock, 'the DO $gate$ ... $gate$ block is missing').not.toBeNull();
    expect(doBlock![0]).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it('gates on pg_proc: no function body may still reference the column', () => {
    expect(gate).toMatch(/\bpg_proc\b/i);
    expect(gate).toMatch(/\bprosrc\b/i);
    expect(gate).toMatch(/role_deprecated_do_not_use/);
  });

  it('gates on pg_policies: no policy predicate may still reference the column', () => {
    expect(gate).toMatch(/\bpg_policies\b/i);
    expect(gate).toMatch(/\bqual\b/i);
    expect(gate).toMatch(/\bwith_check\b/i);
  });

  it('matches the column name as an exact quoted literal, not as a substring of a wider one', () => {
    const operands = [...gate.matchAll(/~\s*('(?:[^']|'')*')/g)].map((m) => m[1]);

    expect(
      operands,
      'both catalogue queries must match on exactly the dropped column name'
    ).toEqual(["'role_deprecated_do_not_use'", "'role_deprecated_do_not_use'"]);
  });

  it('aborts when an offender is FOUND, not when the database is clean', () => {
    const found = gate.match(/\bIS\s+NOT\s+NULL\b/gi) ?? [];

    expect(found, 'one IS NOT NULL guard per catalogue query').toHaveLength(2);
    expect(gate, 'an IS NULL guard inverts the gate: clean aborts, dirty passes').not.toMatch(
      /\bIS\s+NULL\b/i
    );
  });

  it('raises an EXCEPTION inside BOTH branches, so neither can be downgraded to a log line', () => {
    expect(gateBranches, 'expected one guarded branch per catalogue query').toHaveLength(2);
    expect(gateBranches.map((m) => m[1].toLowerCase())).toEqual([
      'offending_functions',
      'offending_policies',
    ]);

    for (const match of gateBranches) {
      const variable = match[1];
      const body = match[2];

      expect(body, `the ${variable} branch must RAISE EXCEPTION`).toMatch(
        /\bRAISE\s+EXCEPTION\b/i
      );
      expect(body, `the ${variable} branch must not merely log`).not.toMatch(
        /\bRAISE\s+(?:NOTICE|WARNING|INFO|LOG|DEBUG)\b/i
      );
    }

    expect(gate.match(/\bRAISE\s+EXCEPTION\b/gi) ?? []).toHaveLength(2);
  });

  it('runs the gate BEFORE any of the three drops', () => {
    const gateAt = executable.search(/DO\s+\$gate\$/);
    const firstDropAt = executable.search(/\b(DROP\s+FUNCTION|DROP\s+COLUMN|DROP\s+TYPE)\b/i);

    expect(gateAt).toBeGreaterThanOrEqual(0);
    expect(firstDropAt).toBeGreaterThanOrEqual(0);
    expect(gateAt).toBeLessThan(firstDropAt);
  });

  it('runs everything in one transaction, so a raised gate rolls the drops back', () => {
    expect(executable).toMatch(/^\s*BEGIN\s*;/m);
    expect(executable).toMatch(/^\s*COMMIT\s*;/m);
    expect(executable.search(/^\s*BEGIN\s*;/m)).toBeLessThan(executable.search(/DO\s+\$gate\$/));
  });
});

describe('#194 migration: the three drops, in dependency order', () => {
  const dropFunctionAt = executable.search(
    /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.get_my_role\s*\(\s*\)/i
  );
  const dropColumnAt = executable.search(
    /ALTER\s+TABLE\s+public\.profiles\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?role_deprecated_do_not_use/i
  );
  const dropTypeAt = executable.search(
    /DROP\s+TYPE\s+(?:IF\s+EXISTS\s+)?public\.user_role/i
  );

  it('drops get_my_role()', () => {
    expect(dropFunctionAt).toBeGreaterThanOrEqual(0);
  });

  it('drops profiles.role_deprecated_do_not_use', () => {
    expect(dropColumnAt).toBeGreaterThanOrEqual(0);
  });

  it('drops the user_role enum', () => {
    expect(dropTypeAt).toBeGreaterThanOrEqual(0);
  });

  it('drops get_my_role() before the column, since both are consumers of the enum', () => {
    expect(dropFunctionAt).toBeGreaterThanOrEqual(0);
    expect(dropColumnAt).toBeGreaterThanOrEqual(0);
    expect(dropFunctionAt).toBeLessThan(dropColumnAt);
  });

  it('drops the enum LAST — DROP TYPE is refused while the function or column still uses it', () => {
    expect(dropTypeAt).toBeGreaterThanOrEqual(0);
    expect(dropTypeAt).toBeGreaterThan(dropFunctionAt);
    expect(dropTypeAt).toBeGreaterThan(dropColumnAt);
  });

  /**
   * Second-order but load-bearing. The absence of CASCADE is what makes a
   * surviving view, index, constraint or trigger dependency abort the
   * migration instead of being silently dropped along with its target — the
   * same "fail now, not weeks later" property the gate above buys. Asserted
   * over the comment-stripped file so the rollback block cannot mask it.
   */
  it('drops nothing with CASCADE — a surviving dependent must fail the migration loudly', () => {
    expect(executable, 'CASCADE turns a refusal into a silent collateral drop').not.toMatch(
      /\bCASCADE\b/i
    );
  });
});

describe('#194 migration: the rollback block is present and honest', () => {
  const rollbackAt = migration.search(/^--\s*ROLLBACK\s*$/im);
  const rollback = rollbackAt >= 0 ? migration.slice(rollbackAt) : '';

  it('carries a rollback section', () => {
    expect(rollbackAt).toBeGreaterThanOrEqual(0);
    expect(rollback.length).toBeGreaterThan(0);
  });

  it('states plainly that the data is not recoverable', () => {
    expect(rollback).toMatch(/NOT\s+(?:a\s+clean\s+revert|recoverable)/i);
    expect(rollback.toLowerCase()).toContain('point-in-time restore');
  });

  it('recreates the enum, the column and the function — the shape, not the values', () => {
    expect(rollback).toMatch(/CREATE\s+TYPE\s+public\.user_role/i);
    expect(rollback).toMatch(/ADD\s+COLUMN\s+role_deprecated_do_not_use/i);
    expect(rollback).toMatch(/FUNCTION\s+public\.get_my_role/i);
  });

  /**
   * `CREATE FUNCTION` does not restore privileges: a fresh function defaults to
   * EXECUTE TO PUBLIC, so following a rollback that stops at the body would
   * leave `get_my_role()` callable by `anon`. That is a privilege regression
   * against the hardened baseline, and precisely the anon-exposure class
   * `anonymous-read-closure.test.ts` exists to police. The live grants and the
   * live comment are part of the object, so a faithful rollback restores them.
   */
  it('restores the live privileges and comment, not just the function body', () => {
    expect(
      rollback,
      'without the REVOKE the rebuilt function is EXECUTE TO PUBLIC, i.e. callable by anon'
    ).toMatch(
      /REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_my_role\s*\(\s*\)\s+FROM\s+PUBLIC\s*,\s*anon\s*;/i
    );
    expect(rollback).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.get_my_role\s*\(\s*\)\s+TO\s+authenticated\s*,\s*service_role\s*;/i
    );
    expect(rollback).toMatch(/COMMENT\s+ON\s+FUNCTION\s+public\.get_my_role\s*\(\s*\)\s+IS/i);
    expect(rollback, 'the restored comment must be the live one').toMatch(
      /derived from profiles\.role_id -> app_roles\.name/
    );
  });

  it('is entirely commented out, so it cannot execute as part of the migration', () => {
    const uncommented = rollback
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('--'));

    expect(uncommented).toEqual([]);
  });
});

// =============================================================================
// Application scaffolding
// =============================================================================

/**
 * Files that named the legacy vocabulary in TypeScript. `database.generated.ts`
 * is excluded on purpose: it is regenerated from the cloud schema after the
 * migration applies, not hand-edited (CORE.md §4).
 */
const SCAFFOLDING_FILES = [
  'src/types/database.ts',
  'src/lib/auth/action-roles.ts',
  'src/lib/auth/authorize.ts',
  'src/actions/roles/assign-role.ts',
];

describe('#194 app scaffolding: the legacy type and map are gone', () => {
  it.each(SCAFFOLDING_FILES)('%s declares and imports no UserRole', (file) => {
    expect(readSrcCode(file)).not.toMatch(/\bUserRole\b/);
  });

  it('src/types/database.ts no longer exports LEGACY_TO_NEW_ROLE_MAP', () => {
    expect(readSrcCode('src/types/database.ts')).not.toMatch(/\bLEGACY_TO_NEW_ROLE_MAP\b/);
  });

  it('the profiles Row type no longer carries the dropped column', () => {
    const source = readSrcCode('src/types/database.ts');
    const profilesRow = source.match(/profiles:\s*\{\s*Row:\s*\{([\s\S]*?)\};/)?.[1];

    expect(profilesRow, 'could not locate the profiles Row type').toBeTruthy();
    expect(profilesRow!).toMatch(/\brole_id\b/);
    expect(profilesRow!).not.toMatch(/^\s*role\s*[?:]/m);
    expect(profilesRow!).not.toMatch(/\brole_deprecated_do_not_use\b/);
  });

  it('AuthorizationResult no longer carries the legacy role field', () => {
    const source = readSrcCode('src/lib/auth/action-roles.ts');
    const iface = source.match(/interface\s+AuthorizationResult\s*\{([\s\S]*?)\n\}/)?.[1];

    expect(iface, 'could not locate AuthorizationResult').toBeTruthy();
    expect(iface!).toMatch(/\broleName\b/);
    expect(iface!).not.toMatch(/^\s*role\s*[?:]/m);
  });

  it('assign-role.ts writes no legacy column and holds no LEGACY_ROLE_MAP', () => {
    const code = readSrcCode('src/actions/roles/assign-role.ts');

    expect(code).not.toMatch(/\bLEGACY_ROLE_MAP\b/);
    expect(code).not.toMatch(/\brole_deprecated_do_not_use\b/);
    expect(code).not.toMatch(/^\s*role:\s*(?:legacyRole|null)\s*,/m);
  });
});

/**
 * Both components gated on a condition that mixed the two vocabularies —
 * `role_name === 'super_admin' || ... || role === 'admin'` — which is the drift
 * ADR-0007 describes, sitting in one expression. The legacy halves cannot
 * survive the column being dropped, and must not come back.
 */
const VOCABULARY_SWAP_COMPONENTS = [
  'src/components/resident-portal/portal-topbar.tsx',
  'src/components/dashboard/header.tsx',
];

const LEGACY_ROLE_LITERALS = /\brole\s*(?:===|!==|==|!=)\s*['"](?:admin|chairman|financial_secretary|security_officer)['"]/;

describe('#194 app scaffolding: components speak one vocabulary', () => {
  it.each(VOCABULARY_SWAP_COMPONENTS)('%s compares no legacy role literal', (file) => {
    const code = readSrcCode(file);

    expect(code).not.toMatch(LEGACY_ROLE_LITERALS);
    expect(code).not.toMatch(/\bUserRole\b/);
  });

  it.each(VOCABULARY_SWAP_COMPONENTS)('%s still gates on the RBAC vocabulary', (file) => {
    const source = readSrc(file);

    expect(source).toMatch(/\brole_name\s*===\s*['"]super_admin['"]/);
  });

  it('the legacy literal matcher does not false-positive on role_name', () => {
    expect(LEGACY_ROLE_LITERALS.test("profile?.role_name === 'chairman'")).toBe(false);
    expect(LEGACY_ROLE_LITERALS.test("profile?.role === 'chairman'")).toBe(true);
    expect(LEGACY_ROLE_LITERALS.test("profile?.role === 'admin'")).toBe(true);
  });
});

// =============================================================================
// The #185 verification probe
// =============================================================================

/**
 * `supabase/probes/role-access-matrix.sql` is the epic's own verification tool:
 * it seeds a probe profile and measures what each role may read. It seeded the
 * legacy column, so #193's rename already broke it with a 42703 — the tool that
 * proves the epic safe was itself dead. It must not name the column again.
 */
describe('#194: the role-access-matrix probe survives the drop', () => {
  const probe = lf(readFileSync(path.join(repoRoot, 'supabase', 'probes', 'role-access-matrix.sql'), 'utf8'));

  const probeExecutable = probe
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');

  const insertColumns = probeExecutable
    .match(/INSERT\s+INTO\s+public\.profiles\s*\(([^)]*)\)/i)?.[1]
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  it('still inserts a probe profile', () => {
    expect(insertColumns, 'could not locate the probe INSERT').toBeTruthy();
    expect(insertColumns!).toContain('role_id');
  });

  it('inserts no legacy role column', () => {
    expect(insertColumns!).not.toContain('role');
    expect(insertColumns!).not.toContain('role_deprecated_do_not_use');
  });

  it('casts nothing to the dropped user_role enum', () => {
    expect(probeExecutable).not.toMatch(/::\s*(?:public\.)?user_role\b/);
  });

  /**
   * Both the SET of markers and their COUNT. The probe carries `:role_name`
   * twice: once where the probe profile is given its `role_id`, and once where
   * the result object is labelled. Setting only one produces no error — it
   * silently probes as one role and files the matrix under another, in the very
   * instrument this epic relies on to prove the drop was safe. A set-only
   * assertion cannot see one of the two sites go missing.
   */
  it('takes exactly one kind of parameter, :role_name, at exactly two marked sites', () => {
    const markers = [...probe.matchAll(/PARAMETER\s+(:[a-z_]+)/gi)].map((m) => m[1]);

    expect([...new Set(markers)]).toEqual([':role_name']);
    expect(markers, 'one site selects the role, the other labels the output').toHaveLength(2);
  });

  it('tells the operator that BOTH marked sites must be replaced', () => {
    const header = probe.slice(0, probe.search(/^BEGIN;/m));

    expect(header).toMatch(/EACH of the TWO lines marked/i);
  });

  it('documents no :legacy_role parameter in its header', () => {
    const header = probe.slice(0, probe.search(/^BEGIN;/m));

    expect(header).not.toMatch(/^--\s+:legacy_role\b/m);
    expect(header).not.toMatch(/LEGACY_ROLE_MAP/);
  });
});
