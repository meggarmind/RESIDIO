import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #193 (epic #182, slice 10) renames `profiles.role` to
 * `role_deprecated_do_not_use`.
 *
 * The rename is a *technique*, not the end state: #194 drops the column. The
 * point of renaming first is that a reader nobody found fails loudly on an
 * unknown column instead of silently reading NULL -- and for an authorization
 * predicate, silently reading NULL means denying access to someone who should
 * have it, with nothing in any log.
 *
 * **The technique's reach is narrower than it looks, and this file must not
 * claim otherwise.** PostgreSQL stores RLS policy expressions parsed rather
 * than as text, so `ALTER TABLE ... RENAME COLUMN` silently rewrites every
 * dependent policy to follow the new name. Measured live, inside a rolled-back
 * transaction: all four remaining legacy policies followed the rename and
 * reported healthy. Nothing in this file asserts anything about policies,
 * because the rename surfaces *string-based* readers only -- application code,
 * the seed/verify scripts, and late-bound plpgsql. The last policy readers are
 * #213 and #214's job.
 *
 * These are structural assertions over the migration file and over the working
 * tree. Nothing here connects to a database -- the same approach as
 * `legacy-policies-part-a.test.ts`, `legacy-policies-part-b.test.ts` and
 * `legacy-role-migration-ratchet.test.ts`.
 *
 * Two things here are worth more than the rest:
 *
 * 1. `create_generated_invoice()` had to be reproduced in full, because
 *    `CREATE OR REPLACE FUNCTION` takes the whole body and only its ~6-line
 *    authorization guard was meant to change. So this file does not merely
 *    check that the new guard is present -- it reconstructs the committed
 *    definition from the migration by substituting the old guard back in, and
 *    demands a byte-for-byte match. An accidental edit anywhere in the other
 *    ~165 lines of invoicing logic fails that.
 *
 * 2. The working-tree scan. A reader missed in `src/**` or `scripts/**` is a
 *    production incident on the day this migration applies, and no assertion
 *    about the migration file can catch one. Scanning is the only mechanism
 *    that turns "we think we found them all" into a test that fails.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const validationDir = path.join(repoRoot, 'docs', 'validation');

const MIGRATION_FILE = '20260906030000_rename_profiles_role_column.sql';

const LEGACY_COLUMN = 'role';
const NEW_COLUMN = 'role_deprecated_do_not_use';

/** Normalised to LF: the assertions below match multi-line SQL literally. */
const lf = (s: string) => s.replace(/\r\n/g, '\n');

const migration = lf(readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8'));

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the *old* function
 * definitions -- including the legacy literal list. A check for legacy
 * references over the whole file could therefore never pass.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/** The rollback block, sliced from its own marker rather than from offset zero. */
const rollback = migration.slice(migration.indexOf('-- ROLLBACK:'), migration.indexOf('\nBEGIN;'));

/**
 * One `CREATE OR REPLACE FUNCTION` statement out of the active SQL, from its
 * header line to the `$function$` that closes its body.
 */
function activeFunction(name: string): string {
  const start = activeSql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start === -1) return '';
  const end = activeSql.indexOf('\n$function$;', start);
  if (end === -1) return '';
  return activeSql.slice(start, end + '\n$function$'.length);
}

const committed = (name: string) =>
  lf(readFileSync(path.join(validationDir, `${name}.current.sql`), 'utf8')).replace(/\s*$/, '');

const handleNewUser = activeFunction('handle_new_user');
const createGeneratedInvoice = activeFunction('create_generated_invoice');

/** The guard clause as it stood, and as it now stands. */
const OLD_GUARD = `        OR NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
              AND ${LEGACY_COLUMN} IN ('admin', 'chairman', 'financial_secretary')
        )`;
const NEW_GUARD = `        OR NOT public.has_permission('billing.create_invoice')`;

// ---------------------------------------------------------------------------
// Working-tree scan
// ---------------------------------------------------------------------------

/**
 * Directories under `src/**` and `scripts/**` are scanned, except tests.
 *
 * Test files are excluded deliberately and the exclusion is narrow: several of
 * them (`legacy-policies-part-a`, `legacy-policies-part-b`, the migration
 * ratchet, `reconcile-profile-role-ids`, and this file) quote the legacy column
 * by name as *subject matter*. They are assertions about SQL text, not readers
 * of a database column, so a scan that flagged them could never go green and
 * would be deleted rather than fixed.
 */
const SCAN_ROOTS = ['src', 'scripts'];
const TEST_PATH = /(^|[\\/])__tests__[\\/]|\.test\.[cm]?[jt]sx?$|\.spec\.[cm]?[jt]sx?$/;
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build']);

function sourceFiles(): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!SCANNED_EXTENSIONS.has(path.extname(entry))) continue;
      const rel = path.relative(repoRoot, full);
      if (TEST_PATH.test(rel)) continue;
      found.push(rel);
    }
  };

  for (const root of SCAN_ROOTS) walk(path.join(repoRoot, root));
  return found.sort();
}

/**
 * Blanks `//` and block comments, replacing each removed character with a space
 * so byte offsets -- and therefore line numbers -- survive.
 *
 * Comments are removed rather than scanned because several of the files this
 * change touches now carry a comment explaining what the legacy column *was*.
 * Prose about a removed reader is not a reader.
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Offset -> 1-based line number, precomputed once per file.
 *
 * Built up front rather than by re-slicing the source at every hit: slicing is
 * quadratic in file size, and across ~1,000 files it pushed this file's
 * slowest test to 4.8s -- close enough to vitest's 5s default that it passed
 * when run alone and timed out under the full suite's load. Which is its own
 * small lesson: a test that is only just fast enough is a flake with a delay
 * on it.
 */
function lineIndexer(code: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '\n') starts.push(i + 1);
  }

  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * A bare `role` token: not `role_id`, not `roleName`, not `app_roles`, and not
 * the `role` in `role.id`.
 *
 * That last exclusion is why `.` appears on both sides of the boundary. Several
 * profiles queries sit in the same statement as a local variable holding an
 * `app_roles` row -- `.eq('role_id', role.id)` -- and a column reference is never
 * written with a property access hanging off it, so requiring that `role` is
 * neither preceded nor followed by a dot separates the two without weakening
 * detection of the column itself.
 */
const BARE_ROLE = /(?<![\w$.])role(?![\w$.])/g;

/**
 * Every reference to the legacy column in one source file, as `line: source`.
 *
 * Two shapes are detected, and between them they cover how the column can be
 * reached from TypeScript at all:
 *
 * 1. **A PostgREST query against `profiles` naming the column.** The window
 *    runs from `.from('profiles')` to the `;` that ends the chained call, and
 *    any bare `role` token inside it is the column -- `role_id`, `roleName` and
 *    `app_roles` do not match `BARE_ROLE`, and nothing else in a profiles query
 *    is called plain `role`. This catches `.select('... role ...')`,
 *    `.eq('role', ...)`, `.update({ role })` and `.insert({ role })` with one
 *    rule rather than four.
 *
 * 2. **A `.role` property read off a profile object.** Belt and braces: the
 *    type system already catches these once `Profile.role` is gone and the
 *    select strings no longer return it, so `tsc --noEmit` is the primary
 *    guard. This exists because a `Record<string, unknown>` or an `any` on the
 *    path would let one through silently.
 */
export function legacyColumnReferences(code: string): string[] {
  const stripped = stripComments(code);
  const lines = code.split('\n');
  const hits = new Set<number>();
  const lineAt = lineIndexer(stripped);

  // 1. profiles queries
  for (const from of stripped.matchAll(/\.from\((['"`])profiles\1\)/g)) {
    const start = from.index ?? 0;
    const semicolon = stripped.indexOf(';', start);
    const window = stripped.slice(start, semicolon === -1 ? stripped.length : semicolon);

    for (const match of window.matchAll(BARE_ROLE)) {
      hits.add(lineAt(start + (match.index ?? 0)));
    }
  }

  // 2. `.role` property reads off something profile-shaped
  for (const match of stripped.matchAll(/\bprofiles?(?:Data)?\??\.role(?![\w$])/g)) {
    hits.add(lineAt(match.index ?? 0));
  }

  return [...hits].sort((a, b) => a - b).map((line) => `${line}: ${(lines[line - 1] ?? '').trim()}`);
}

describe('#193: profiles.role is renamed out of existence', () => {
  it('the migration exists under the agreed filename', () => {
    // Pinned by exact name: sibling slices are writing 20260906010000 and
    // 20260906020000 into the same directory, apply order matters, and the
    // applied-migrations record is keyed on the filename.
    expect(readdirSync(migrationsDir)).toContain(MIGRATION_FILE);
  });

  it('wraps its work in a single transaction', () => {
    // The rename and both function replacements land together or not at all.
    // A partial apply leaves handle_new_user() inserting into a column that no
    // longer exists, which breaks every new sign-up.
    expect(activeSql).not.toBe('');
    expect((migration.match(/^BEGIN;$/gm) ?? []).length).toBe(1);
    expect((migration.match(/^COMMIT;$/gm) ?? []).length).toBe(1);
  });

  it('renames the column to role_deprecated_do_not_use', () => {
    expect(activeSql).toContain(
      `ALTER TABLE public.profiles RENAME COLUMN ${LEGACY_COLUMN} TO ${NEW_COLUMN};`
    );
    // A DROP here instead of a RENAME would destroy the evidence #194 needs and
    // skip the fail-loud step this whole slice exists to provide.
    expect(activeSql).not.toMatch(/ALTER\s+TABLE\s+(?:public\.)?profiles[\s\S]*?DROP\s+COLUMN/i);
  });

  it('handle_new_user() no longer names the legacy column', () => {
    expect(handleNewUser).not.toBe('');
    // Not "writes NULL to it" -- the column is gone from the INSERT entirely.
    expect(handleNewUser).toContain(
      'INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)'
    );
    expect(legacySqlTokens(handleNewUser)).toEqual([]);
    // And the rest of it still does its job: a new account is provisioned with
    // no role and no access until an administrator approves it.
    expect(handleNewUser).toContain("'pending'   -- no access until approved");
    expect(handleNewUser).toContain('ON CONFLICT (id) DO NOTHING;');
    // Attributes must survive a CREATE OR REPLACE: this is a trigger function
    // on auth.users and needs both SECURITY DEFINER and its own search_path.
    expect(handleNewUser).toContain('SECURITY DEFINER');
    expect(handleNewUser).toContain(
      "SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'"
    );
  });

  it('create_generated_invoice() authorizes on the permission, not the column', () => {
    expect(createGeneratedInvoice).not.toBe('');
    expect(createGeneratedInvoice).toContain(NEW_GUARD);
    // The literal list is what actually had to go. Checked against the function
    // text only, so the rollback block -- which must still quote it -- cannot
    // satisfy or defeat this.
    expect(createGeneratedInvoice).not.toContain(
      "IN ('admin', 'chairman', 'financial_secretary')"
    );
    expect(legacySqlTokens(createGeneratedInvoice)).toEqual([]);
  });

  it('create_generated_invoice() keeps the actor half of the guard and still raises', () => {
    // The mutation this catches is deleting the guard rather than fixing it.
    // The clause is unreachable today -- invoice-generation-worker.ts calls
    // through createAdminClient(), so auth.uid() is NULL and the whole IF
    // short-circuits -- which makes deleting it free and invisible. It is
    // defence in depth against a future user-JWT caller, and a test that only
    // looked for the has_permission() call would pass with the guard gone.
    expect(createGeneratedInvoice).toContain('IF auth.uid() IS NOT NULL AND (');
    expect(createGeneratedInvoice).toContain('auth.uid() IS DISTINCT FROM p_actor_id');
    expect(createGeneratedInvoice).toContain(
      "RAISE EXCEPTION 'Not authorised to create generated invoices';"
    );
    // The two halves are OR-ed inside one IF, in that order. Pinning the whole
    // clause is what stops the actor check being demoted to a stray line that
    // no longer gates anything.
    expect(createGeneratedInvoice).toContain(
      `    IF auth.uid() IS NOT NULL AND (\n` +
        `        auth.uid() IS DISTINCT FROM p_actor_id\n` +
        `${NEW_GUARD}\n` +
        `    ) THEN\n` +
        `        RAISE EXCEPTION 'Not authorised to create generated invoices';\n` +
        `    END IF;`
    );
  });

  it('changes nothing in create_generated_invoice() except the guard clause', () => {
    // The strongest assertion in this file. `CREATE OR REPLACE FUNCTION` takes
    // the entire body, so ~165 lines of invoicing logic -- invoice numbering,
    // the idempotency conflict target, item-total reconciliation, wallet
    // settlement, the failure handler -- had to be retyped around a six-line
    // edit. Substituting the old guard back must reproduce the committed
    // definition exactly; any collateral change fails here rather than in
    // production billing.
    expect(createGeneratedInvoice.replace(NEW_GUARD, OLD_GUARD)).toBe(
      committed('create_generated_invoice')
    );
  });

  it('changes nothing in handle_new_user() except the legacy column', () => {
    const restored = handleNewUser
      .replace(
        'INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)',
        'INSERT INTO public.profiles (id, email, full_name, role, role_id, approval_status)'
      )
      .replace(
        '        NULL,       -- role_id: assigned by an administrator on approval',
        '        NULL,       -- legacy role: deprecated, never trusted\n' +
          '        NULL,       -- role_id: assigned by an administrator on approval'
      );

    expect(restored).toBe(committed('handle_new_user'));
  });

  it('carries a rollback comment block that restores the column and both functions', () => {
    expect(rollback.startsWith('-- ROLLBACK:')).toBe(true);
    expect(rollback).toContain('-- BEGIN;');
    expect(rollback).toContain('-- COMMIT;');
    expect(rollback).toContain(
      `-- ALTER TABLE public.profiles RENAME COLUMN ${NEW_COLUMN} TO ${LEGACY_COLUMN};`
    );

    // A rollback that restored the column but left the rewritten functions in
    // place would leave create_generated_invoice() calling has_permission()
    // against a schema that had gone back -- which happens to work, and
    // handle_new_user() writing no legacy value at all, which silently changes
    // what a rollback restores. Both original bodies must be here.
    expect(rollback).toContain('-- CREATE OR REPLACE FUNCTION public.handle_new_user()');
    expect(rollback).toContain(
      '-- CREATE OR REPLACE FUNCTION public.create_generated_invoice(p_candidate_id uuid, p_actor_id uuid)'
    );
    // And it must restore the *legacy* predicate, not the new one. A rollback
    // block that has drifted into re-stating has_permission() is not a rollback.
    expect(rollback).toContain(
      "--               AND role IN ('admin', 'chairman', 'financial_secretary')"
    );
    expect(rollback).toContain('--         NULL,       -- legacy role: deprecated, never trusted');
    expect(rollback).not.toContain("has_permission('billing.create_invoice')");

    // Uncommenting the block must yield the definitions that are live today.
    const uncommented = rollback.replace(/^-- ?/gm, '');
    expect(uncommented).toContain(committed('handle_new_user'));
    expect(uncommented).toContain(committed('create_generated_invoice'));
  });

  it('has no executable SQL outside the transaction', () => {
    // Every content assertion above is anchored to the BEGIN;..COMMIT; slice,
    // so a statement parked above BEGIN; or below COMMIT; would be applied by
    // psql and seen by none of them.
    const outside = migration.replace(activeSql, '').replace(/^\s*--[^\n]*/gm, '');
    expect(outside.trim()).toBe('');
  });

  it('no file under src/** or scripts/** still reads the legacy column', () => {
    // The assertion this slice actually lives or dies by. Everything else here
    // describes a migration file; this describes the application that has to
    // survive it. A missed reader is not a failed test on the day the migration
    // applies -- it is a 500, or worse, a silent denial.
    const offenders = new Map<string, string[]>();

    for (const file of sourceFiles()) {
      const refs = legacyColumnReferences(readFileSync(path.join(repoRoot, file), 'utf8'));
      if (refs.length > 0) offenders.set(file, refs);
    }

    expect(Object.fromEntries(offenders)).toEqual({});
    // Explicit timeout: this walks and reads every source file under two
    // trees, so it is legitimately the slowest test here and must not sit
    // near vitest's 5s default, where machine load rather than the
    // codebase decides whether it passes.
  }, 30000);

  it('the scanner detects the shapes it claims to detect', () => {
    // Without this the scan above is unfalsifiable: a detector that matched
    // nothing would pass it on an empty repo just as happily as on a clean one.
    // Each case below is a reader that existed in this codebase before #193.
    expect(
      legacyColumnReferences(
        `const { data } = await supabase.from('profiles').select('id, email, role, role_id');`
      )
    ).toHaveLength(1);

    expect(
      legacyColumnReferences(`await supabase.from('profiles').select('id').eq('role', 'admin');`)
    ).toHaveLength(1);

    expect(
      legacyColumnReferences(
        `await supabase.from('profiles').update({ role_id: id, role: legacyRole }).eq('id', x);`
      )
    ).toHaveLength(1);

    expect(legacyColumnReferences(`const isSuperAdmin = profile?.role === 'admin';`)).toHaveLength(
      1
    );

    expect(legacyColumnReferences(`const legacy = profileData.role as UserRole;`)).toHaveLength(1);

    // ...and does not fire on the RBAC vocabulary that replaced it, on
    // unrelated tables, or on prose.
    expect(
      legacyColumnReferences(
        `await supabase.from('profiles').select('id, role_id, resident_id, app_roles!profiles_role_id_fkey (name)');`
      )
    ).toEqual([]);
    expect(legacyColumnReferences(`const isSuperAdmin = profile?.role_name === 'super_admin';`)).toEqual(
      []
    );
    expect(
      legacyColumnReferences(`await supabase.from('residents').select('id, role').eq('id', x);`)
    ).toEqual([]);
    expect(legacyColumnReferences(`// the deprecated profiles.role column is gone`)).toEqual([]);
    expect(legacyColumnReferences(`/* profile.role was read here until #193 */`)).toEqual([]);
  });
});

/**
 * Bare `role` tokens in a chunk of SQL, ignoring `role_id`, `app_roles`,
 * `role_permissions` and Supabase's own `auth.role()` claim function.
 *
 * Scoped to a single function body, where `profiles` is the only table in
 * play, so an unqualified `role` can only be the legacy column.
 */
function legacySqlTokens(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .filter((line) => /(?<![\w$.])role(?![\w$])/.test(line))
    .map((line) => line.trim());
}
