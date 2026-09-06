import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ratchet: no *new* migration may authorize an RLS policy by comparing
 * `app_roles.name` (or an aliased equivalent) against a hardcoded string
 * literal or `ARRAY[...]` of string literals, instead of calling
 * `has_permission()`.
 *
 * Issue #213: 20 policies across 13 tables authorize with a shape like
 *
 *   EXISTS (
 *     SELECT 1 FROM profiles p JOIN app_roles ar ON p.role_id = ar.id
 *     WHERE p.id = auth.uid()
 *       AND ar.name = ANY (ARRAY['super_admin','chairman','financial_officer'])
 *   )
 *
 * This reads the *modern* column (`role_id`), so
 * `legacy-role-migration-ratchet.test.ts` -- which detects references to the
 * legacy `profiles.role` column -- never fires on it. That is precisely how
 * this population grew unnoticed while epic #182 was retiring the legacy
 * vocabulary next to it, in the same migrations directory, under the same
 * review process. Without a ratchet here, it regrows the same way: a future
 * migration reaches for the pattern already used twenty times, rather than
 * for `has_permission()`.
 *
 * Existing offenders are allowlisted **by filename**, so the list can only
 * shrink: a file that no longer contains the pattern must be dropped from
 * the allowlist, and a file that is not on it may not start containing it.
 *
 * Modelled on `legacy-role-migration-ratchet.test.ts` -- this repo's
 * established pattern for exactly this shape of problem -- and on
 * `anonymous-read-closure.test.ts` for the general approach of asserting
 * structurally over a migration file without touching a database.
 *
 * Four deliberate non-targets, each excluded on purpose rather than by
 * accident of the regex:
 *
 * - `has_permission('...')` calls are not flagged. That call is the entire
 *   point of the #213 rewrite -- a migration full of them, replacing every
 *   one of the 20 policies, must pass this test cleanly.
 * - The `role_permissions` / `app_permissions` bridge is not flagged.
 *   Several policies (four on `entity_notes`, one on `documents`) join
 *   `profiles -> app_roles -> role_permissions -> app_permissions` purely to
 *   reach a permission name, e.g. `ap.name = 'notes.create'`. That predicate
 *   qualifies `.name` on the `app_permissions` alias, not on the `app_roles`
 *   alias -- `app_roles` is crossed only as a bridge to `role_permissions`,
 *   never compared itself -- so it is authorizing on a permission, which is
 *   correct, not a hardcoded role name. Detection tracks which alias is
 *   bound to which table for exactly this reason: it must tell "the alias
 *   bound to app_roles" apart from "the alias bound to app_permissions" and
 *   only ever look at `.name` comparisons on the former.
 * - Seed and catalogue DML is not flagged: `INSERT INTO app_roles` (the role
 *   catalogue itself) and the `INSERT INTO role_permissions ... SELECT ...
 *   FROM app_roles r ... WHERE r.name IN (...)` shape that `CORE.md` §6
 *   explicitly prescribes for granting permissions to roles. That statement
 *   also compares `r.name` (an app_roles alias) against string literals, so
 *   without this exclusion it would be indistinguishable from the policy
 *   pattern this file exists to catch -- and flagging it would fight a
 *   documented, required convention rather than an authorization defect.
 * - SQL comments are stripped before scanning. The #213 migration itself
 *   carries a rollback block, in a comment, that restores the *old*
 *   hardcoded policies verbatim -- CORE.md's migration convention requires
 *   rollback SQL that reconstructs the real prior state, and that prior
 *   state is precisely the pattern this ratchet forbids going forward. If
 *   comments were scanned, the migration that fixes all 20 policies would
 *   fail its own ratchet by way of the rollback block documenting what it
 *   fixed. `stripSqlComments` below removes `--` line comments and `/* *\/`
 *   block comments (but not string literals -- the literal contents are
 *   exactly what this detector needs to see) before any pattern is applied.
 *
 * One related-but-out-of-scope defect, deliberately **not** covered here:
 * `app_roles.category` comparisons (e.g. `r.category = 'exco'`), which
 * appear alongside some of these `.name` predicates today. `category` is a
 * coarser grouping than the fine-grained `app_roles.name` vocabulary this
 * ratchet targets, and folding it in would conflate two different
 * migrations' worth of cleanup into one detector. It is a real defect of the
 * same species and deserves its own ratchet if #213's sibling issue ever
 * takes it on -- it is out of scope for this one.
 *
 * One known detection gap, disclosed rather than silently accepted:
 * `20260118090000_add_hybrid_payments.sql` gates a `storage.objects` policy
 * with `(SELECT name FROM app_roles ar JOIN profiles pr ON pr.role_id =
 * ar.id WHERE pr.id = auth.uid()) IN ('super_admin', 'chairman',
 * 'financial_officer')` -- the same defect, but with the role's own name
 * selected bare inside a scalar subquery rather than compared through an
 * alias-qualified `ar.name`. #213's own description scopes the pattern to
 * the alias-qualified form (`ar.name`, `r.name`), and this file is not one
 * of the 20 policies across 13 tables it names, so it is left off this
 * ratchet's allowlist rather than stretched for. A migration that repeats
 * *this* exact unaliased shape would not be caught here.
 *
 * As with the legacy-role ratchet, this is a list of *files*, not of live
 * policies: some of these migrations were superseded by later ones in this
 * directory, and some live policies in the database were applied without a
 * corresponding file here at all. The database, not this list, is ground
 * truth for what #213's sibling migration must rewrite; this list only
 * records what must stop growing in the files that exist.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));

/**
 * Migrations that compared `app_roles.name` (or an aliased equivalent)
 * against a hardcoded string literal or array of literals, as of this
 * ratchet's introduction (#213).
 *
 * Derived by running the detector below, `hardcodedRoleNameReferences()`,
 * against every file in `supabase/migrations/` on this branch and recording
 * every filename it flagged -- not transcribed from the issue body or from
 * any other list. The #213 sibling migration that rewrites all 20 live
 * policies to `has_permission()` lives on a different branch
 * (`fix/issue-213-policies-follow-permissions`) and is therefore absent from
 * this scan; once that branch merges, this allowlist should shrink toward
 * empty and this comment's premise should be re-checked.
 */
const ALLOWLIST = new Set<string>([
  '20251222000000_create_rbac_system.sql',
  '20251225100000_invoice_generation_automation.sql',
  '20251228100000_create_document_management.sql',
  '20260106100002_migrate_legacy_notes.sql',
  '20260114225000_create_expenditure_module.sql',
  '20260114225800_create_project_tracker_module.sql',
  '20260119000102_fix_vendors_rls.sql',
  '20260815121518_create_personnel_engagements.sql',
  '20260829100100_backfill_profile_role_ids.sql',
  '20260829100200_gate_auth_helpers_on_approval_status.sql',
  '20260830100200_chairman_excludes_settings_module.sql',
  '20260904215745_require_active_super_admin.sql',
  '20260905003000_close_anonymous_table_reads.sql',
]);

/**
 * Blanks out `--` line comments and `/* *\/` block comments, replacing each
 * removed character with a space so byte offsets -- and therefore line
 * numbers -- are unchanged. String literals are left intact deliberately:
 * unlike the legacy-role ratchet's `stripSqlNoise`, this detector needs to
 * see literal contents to tell `ar.name = ANY (ARRAY['super_admin'])` (a
 * hardcoded comparison) apart from `ar.name = ANY (SELECT name FROM x)` (not
 * one). A `'--'` or `'/*'` occurring inside a string literal is walked over
 * rather than treated as the start of a comment.
 */
export function stripSqlComments(sql: string): string {
  const out: string[] = [];
  let i = 0;

  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) out.push(sql[k] === '\n' ? '\n' : ' ');
  };

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          j += 1;
          break;
        }
        j += 1;
      }
      out.push(sql.slice(i, j));
      i = j;
      continue;
    }

    out.push(sql[i]);
    i += 1;
  }

  return out.join('');
}

/** Reserved words that can never be a table alias, guarding the binding regexes below. */
const RESERVED = new Set([
  'on',
  'where',
  'set',
  'values',
  'select',
  'as',
  'left',
  'right',
  'inner',
  'join',
  'cross',
  'group',
  'order',
  'limit',
  'returning',
  'using',
]);

/**
 * Table aliases bound to `app_roles` anywhere in the file, e.g.
 * `JOIN app_roles ar ON ...`, `FROM app_roles r`, or the `DELETE ... USING
 * app_roles ar, app_permissions ap` form a role-revoking DML statement uses
 * in place of a join. The bare table name `app_roles` itself is always
 * included, so an unaliased `app_roles.name = 'x'` is caught too.
 */
function roleAliases(code: string): Set<string> {
  const aliases = new Set<string>(['app_roles']);
  const binding =
    /\b(?:FROM|JOIN|USING)\s+(?:public\.)?app_roles\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi;

  for (const match of code.matchAll(binding)) {
    const alias = match[1].toLowerCase();
    if (!RESERVED.has(alias)) aliases.add(alias);
  }

  return aliases;
}

/**
 * Matches what can legally sit between `<alias>.name` and the string literal
 * it is compared against: an optional cast or two (`::text`,
 * `::character varying`), closing parens left over from the cast, the
 * comparison operator itself (`=`, `<>`, `!=`, `IN`), and the optional
 * `ANY (` / `ALL (` / `ARRAY[` / plain `(` wrapping that precedes an `IN`
 * list or an array literal. Anchored at the start of the remainder so it
 * fails fast on anything else -- a subquery (`= ANY (SELECT ...)`), a join
 * to another column, a function call -- none of which is a hardcoded
 * literal.
 */
const NAME_COMPARES_TO_LITERAL =
  /^(?:\s*\)?\s*::\s*[a-z_]+(?:\s+varying)?)*\s*\)?\s*(?:=|<>|!=|IN)\s*(?:ANY\s*|ALL\s*)?\(*\s*(?:ARRAY\s*)?\[?\(*\s*'/i;

/** Statements that seed or catalogue roles/permissions rather than authorize with them. */
function isSeedOrCatalogueStatement(statement: string): boolean {
  return /^\s*INSERT\s+INTO\s+(?:public\.)?(app_roles|role_permissions)\b/i.test(statement);
}

/**
 * Every hardcoded `app_roles.name` comparison in one migration, as
 * `line: source` strings.
 *
 * Statement-scoped, like `legacyRoleReferences()` in the sibling ratchet:
 * the shape being caught routinely spans several lines (a multi-line
 * `EXISTS (...)` predicate), so line-by-line matching would miss it, and a
 * comparison is only meaningful in the context of the statement that binds
 * its aliases.
 */
export function hardcodedRoleNameReferences(sql: string): string[] {
  const code = stripSqlComments(sql);
  const original = sql.split('\n');
  const aliases = roleAliases(code);
  const hitLines = new Set<number>();

  const lineAt = (offset: number) => code.slice(0, offset).split('\n').length;

  let cursor = 0;
  for (const statement of code.split(';')) {
    const base = cursor;
    cursor += statement.length + 1;

    if (isSeedOrCatalogueStatement(statement)) continue;

    for (const match of statement.matchAll(/\b([a-z_][a-z0-9_]*)\.name\b/gi)) {
      const qualifier = match[1].toLowerCase();
      if (!aliases.has(qualifier)) continue;

      const after = statement.slice((match.index ?? 0) + match[0].length);
      if (NAME_COMPARES_TO_LITERAL.test(after)) {
        hitLines.add(lineAt(base + (match.index ?? 0)));
      }
    }
  }

  return [...hitLines]
    .sort((a, b) => a - b)
    .map((line) => `${line}: ${(original[line - 1] ?? '').trim()}`);
}

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

function offenders(): Map<string, string[]> {
  const found = new Map<string, string[]>();

  for (const name of migrationFiles()) {
    const refs = hardcodedRoleNameReferences(readFileSync(path.join(migrationsDir, name), 'utf8'));
    if (refs.length > 0) found.set(name, refs);
  }

  return found;
}

describe('hardcoded role-name migration ratchet', () => {
  it('finds no hardcoded app_roles.name comparison outside the allowlist', () => {
    const unexpected = [...offenders().entries()]
      .filter(([name]) => !ALLOWLIST.has(name))
      .map(([name, refs]) => `${name}\n    ${refs.join('\n    ')}`);

    expect(unexpected).toEqual([]);
  });

  it('keeps the allowlist shrinking — every entry still names a real offender', () => {
    const current = offenders();
    const stale = [...ALLOWLIST].filter((name) => !current.has(name)).sort();

    expect(stale).toEqual([]);
  });

  describe('the detector', () => {
    it('catches a direct ANY(ARRAY[...]) comparison, the live #213 shape', () => {
      const sql = `CREATE POLICY "x" ON t FOR ALL USING (
        EXISTS (
          SELECT 1 FROM profiles p JOIN app_roles ar ON p.role_id = ar.id
          WHERE p.id = auth.uid()
            AND ar.name = ANY (ARRAY['super_admin','chairman','financial_officer'])
        )
      );`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('catches the join written the other direction, id = role_id', () => {
      const sql = `EXISTS (SELECT 1 FROM profiles p JOIN app_roles r ON r.id = p.role_id WHERE r.name IN ('super_admin', 'chairman'));`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('catches the cast-heavy pg_dump form with a category OR clause', () => {
      const sql = `USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('catches a plain equality comparison', () => {
      expect(
        hardcodedRoleNameReferences("SELECT 1 FROM app_roles r WHERE r.name = 'super_admin';")
      ).toHaveLength(1);
    });

    it('catches the DELETE ... USING app_roles form, not just FROM/JOIN', () => {
      // 20260830100200_chairman_excludes_settings_module.sql revokes a grant
      // with `DELETE ... USING app_roles ar, app_permissions ap`, which binds
      // the alias the same way a join would but without the FROM/JOIN
      // keyword the alias-binding regex otherwise looks for.
      const sql = `DELETE FROM role_permissions rp
        USING app_roles ar, app_permissions ap
        WHERE rp.role_id = ar.id AND rp.permission_id = ap.id
          AND ar.name = 'chairman' AND ap.category IN ('settings', 'system');`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('ignores has_permission() calls -- the whole point of the #213 rewrite', () => {
      const sql = `CREATE POLICY "x" ON t FOR ALL USING (has_permission('manage_expenditure'));`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores app_roles used only as a bridge to role_permissions/app_permissions', () => {
      const sql = `CREATE POLICY "x" ON entity_notes FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM profiles p
          JOIN app_roles ar ON p.role_id = ar.id
          JOIN role_permissions rp ON rp.role_id = ar.id
          JOIN app_permissions ap ON ap.id = rp.permission_id
          WHERE p.id = auth.uid() AND ap.name = 'notes.create'
        )
      );`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores the documented seed convention: INSERT INTO role_permissions ... WHERE r.name IN (...)', () => {
      const sql = `INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
        WHERE r.name IN ('super_admin', 'chairman') AND p.category = 'new_module'
        ON CONFLICT DO NOTHING;`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores INSERT INTO app_roles seeding the role catalogue itself', () => {
      const sql = `INSERT INTO app_roles (name, display_name) VALUES ('super_admin', 'Super Admin');`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores the pattern inside a -- line comment, including rollback SQL', () => {
      const sql = `-- AND ar.name = ANY (ARRAY['super_admin','chairman','financial_officer'])`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores the pattern inside a /* */ block comment, including a rollback block', () => {
      const sql = `/* CREATE POLICY "x" ON t USING (ar.name = ANY (ARRAY['super_admin'])); */`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('does not flag app_roles.category comparisons -- out of scope for this ratchet', () => {
      expect(
        hardcodedRoleNameReferences("SELECT 1 FROM app_roles r WHERE r.category = 'exco';")
      ).toEqual([]);
    });

    it('does not flag a comparison against a subquery, not a literal', () => {
      const sql = `SELECT 1 FROM app_roles r WHERE r.name = ANY (SELECT name FROM other_roles);`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });
  });
});
