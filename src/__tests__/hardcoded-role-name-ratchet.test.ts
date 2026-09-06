import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ratchet: no *new* migration may authorize an RLS policy by comparing
 * `app_roles.name` against a hardcoded string literal or `ARRAY[...]` of
 * string literals, instead of calling `has_permission()` -- however the
 * column is reached: alias-qualified (`ar.name`, `r.name`), schema-qualified
 * (`app_roles.name`, `public.app_roles.name`), bare inside a subquery rooted
 * at `app_roles` (`SELECT id FROM app_roles WHERE name = '...'`), or as the
 * output of a scalar subquery compared from outside
 * (`(SELECT ar.name FROM app_roles ar JOIN ...) IN ('...', '...')`).
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
 * #213's own description names the alias-qualified shape because that is
 * the population that already exists -- it is not a spec for the shapes a
 * future author might reach for instead. This detector does not stop at
 * that one surface: `is_super_admin()` in
 * `20251222000001_fix_rbac_rls_policies.sql` writes the identical defect as
 * `p.role_id IN (SELECT id FROM app_roles WHERE name = 'super_admin')` --
 * `name` unqualified, because the subquery's only table *is* `app_roles` --
 * and a live `storage.objects` policy in
 * `20260118090000_add_hybrid_payments.sql` writes it as a scalar subquery,
 * `(SELECT name FROM app_roles ar JOIN profiles pr ON pr.role_id = ar.id
 * WHERE pr.id = auth.uid()) IN ('super_admin', 'chairman',
 * 'financial_officer')`, whose result is compared *outside* the subquery
 * rather than inside it. A ratchet that only recognised the first shape
 * would be walked around by the second and third without anyone intending
 * to route around it -- both are simple rephrasings of the same idea, not
 * exotic SQL.
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
 * Deliberate non-targets, each excluded on purpose rather than by accident
 * of the regex:
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
 *   catalogue itself), the `INSERT INTO role_permissions ... SELECT ...
 *   FROM app_roles r ... WHERE r.name IN (...)` shape that `CORE.md` §6
 *   explicitly prescribes for granting permissions to roles, and the same
 *   convention written with the role/permission lookups pulled into CTEs
 *   first (`WITH roles AS (SELECT id, name FROM app_roles WHERE name IN
 *   (...)), perms AS (...) INSERT INTO role_permissions ...`, as
 *   `20260119000101_add_personnel_perms.sql` does it). Both shapes compare
 *   `name` against string literals, so without this exclusion they would be
 *   indistinguishable from the policy pattern this file exists to catch --
 *   and flagging them would fight a documented, required convention rather
 *   than an authorization defect. The exclusion is statement-scoped (a
 *   statement starting with `INSERT INTO app_roles`/`role_permissions`, or
 *   starting with `WITH` and containing one of those `INSERT INTO`s further
 *   in), not subquery-scoped, precisely so that the bare-`name`-in-a-
 *   subquery-rooted-at-app_roles detector below does not have to tell a
 *   seeding CTE apart from an authorizing one by shape alone -- they are the
 *   same shape. If a future migration needs that distinction drawn more
 *   finely, allowlisting it with a comment is the fallback; silently
 *   flagging (or silently missing) it is not.
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
 * One deliberate scope limit on the bare-`name` detector: it only fires when
 * the subquery's `FROM app_roles [alias]` is not followed by a `JOIN` --
 * i.e. `app_roles` is the *only* table that subquery reaches. A bare `name`
 * inside a subquery that joins app_roles to some other table could belong to
 * that other table instead, and nothing here is positioned to tell whose
 * column it is. The scalar-subquery-compared-outside detector does not need
 * that restriction, because it requires the `name` to be the thing the
 * subquery actually selects -- unambiguous regardless of what else the
 * subquery joins.
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
 * Migrations that compared `app_roles.name` against a hardcoded string
 * literal or array of literals, in any of the four forms this detector
 * recognizes, as of this ratchet's introduction (#213).
 *
 * Derived by running the detector below, `hardcodedRoleNameReferences()`,
 * against every file in `supabase/migrations/` on this branch and recording
 * every filename it flagged -- not transcribed from the issue body or from
 * any other list. The #213 sibling migration that rewrites all 20 live
 * policies to `has_permission()` lives on a different branch
 * (`fix/issue-213-policies-follow-permissions`) and is therefore absent from
 * this scan; once that branch merges, this allowlist should shrink toward
 * empty and this comment's premise should be re-checked.
 *
 * `20260118090000_add_hybrid_payments.sql` is on this list even though a
 * coarser independent scan (by a coordinator reviewing this file) predicted
 * it would not need to be, on the theory that the sibling branch already
 * covers it. That theory does not hold on *this* branch: the file's own
 * text reads `SELECT name FROM app_roles ar JOIN profiles pr ...` -- `name`
 * bare, not `ar.name` -- and this detector, run here, finds it and must
 * report it as the real current offender it is. It stays allowlisted (not
 * silently dropped) until whichever branch fixes it lands and this scan is
 * re-run.
 */
const ALLOWLIST = new Set<string>([
  '20251222000000_create_rbac_system.sql',
  '20251222000001_fix_rbac_rls_policies.sql',
  '20251225100000_invoice_generation_automation.sql',
  '20251228100000_create_document_management.sql',
  '20260106100002_migrate_legacy_notes.sql',
  '20260114225000_create_expenditure_module.sql',
  '20260114225800_create_project_tracker_module.sql',
  '20260118090000_add_hybrid_payments.sql',
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

/**
 * Statements that seed or catalogue roles/permissions rather than authorize
 * with them: a direct `INSERT INTO app_roles`/`role_permissions`, or the
 * same thing with the role/permission lookups pulled into CTEs first
 * (`WITH roles AS (...) INSERT INTO role_permissions ...`). The CTE form is
 * detected by statement shape (starts with `WITH`, contains a qualifying
 * `INSERT INTO` later on) rather than by parsing which CTE feeds which
 * clause -- see the docblock's note on why that coarser boundary is the
 * right one here.
 */
function isSeedOrCatalogueStatement(statement: string): boolean {
  const trimmed = statement.trimStart();

  if (/^INSERT\s+INTO\s+(?:public\.)?(app_roles|role_permissions)\b/i.test(trimmed)) {
    return true;
  }

  return (
    /^WITH\b/i.test(trimmed) &&
    /INSERT\s+INTO\s+(?:public\.)?(app_roles|role_permissions)\b/i.test(trimmed)
  );
}

/**
 * Every parenthesized `(SELECT ...)` subquery within a statement whose FROM
 * clause's first table is `app_roles`, found by walking balanced parens from
 * each `(SELECT` opener. Returns, per match, the subquery's own text (`body`,
 * excluding the delimiting parens), what immediately follows its closing
 * paren (`afterParen` -- for the scalar-subquery-compared-outside shape),
 * and `bodyStart`/`afterStart`, the offsets of each within the statement, for
 * line-number reporting.
 *
 * A nested subquery inside the SELECT list itself (rare enough that no
 * migration scanned here does it) could in principle confuse "first FROM",
 * but every live instance of this defect keeps the SELECT list to plain
 * column references.
 */
function appRolesRootedSubqueries(
  statement: string
): Array<{ body: string; bodyStart: number; afterParen: string; afterStart: number }> {
  const results: Array<{ body: string; bodyStart: number; afterParen: string; afterStart: number }> =
    [];
  const opener = /\(\s*SELECT\b/gi;

  for (const match of statement.matchAll(opener)) {
    const openIdx = match.index ?? 0;
    const bodyStart = openIdx + match[0].length;

    let depth = 1;
    let closeIdx = -1;
    for (let k = bodyStart; k < statement.length; k++) {
      if (statement[k] === '(') depth++;
      else if (statement[k] === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = k;
          break;
        }
      }
    }
    if (closeIdx === -1) continue;

    const body = statement.slice(bodyStart, closeIdx);
    const firstFrom = /\bFROM\s+(?:public\.)?([a-z_][a-z0-9_]*)\b/i.exec(body);
    if (!firstFrom || firstFrom[1].toLowerCase() !== 'app_roles') continue;

    results.push({ body, bodyStart, afterParen: statement.slice(closeIdx + 1), afterStart: closeIdx + 1 });
  }

  return results;
}

/**
 * The bare-`name` shape (Miss 1): the subquery's `FROM app_roles [alias]` is
 * immediately followed by `WHERE` (or nothing) rather than a `JOIN` or a
 * comma-joined second table, so `app_roles` is the *only* table that
 * subquery reaches and an unqualified `name` inside it can only be
 * `app_roles.name`. Relies on ordinary backtracking to reject the joined
 * case correctly: for `FROM app_roles ar JOIN profiles ...`, the optional
 * alias group first tries consuming `ar`, finds `JOIN` where it needs
 * `WHERE`/end, backtracks to consuming no alias, finds `ar` where it again
 * needs `WHERE`/end, and gives up -- it does not need to know the word
 * `JOIN` to reject it. Deliberately does not match `<alias>.name`, which the
 * caller's alias-based pass already covers; this only looks at `name` with
 * no qualifier at all.
 */
const APP_ROLES_ONLY_NO_JOIN =
  /\bFROM\s+(?:public\.)?app_roles\b(?:\s+(?:AS\s+)?[a-z_][a-z0-9_]*)?\s*(?:WHERE\b|$)/i;

/** The subquery's SELECT list is (or starts with) `name`, bare or alias-qualified -- the Miss 2 shape. */
const SELECTS_NAME_FIRST = /^\s*(?:DISTINCT\s+)?(?:[a-z_][a-z0-9_]*\.)?name\b\s*FROM\b/i;

/**
 * Every hardcoded `app_roles.name` comparison in one migration, as
 * `line: source` strings.
 *
 * Statement-scoped, like `legacyRoleReferences()` in the sibling ratchet:
 * the shape being caught routinely spans several lines (a multi-line
 * `EXISTS (...)` predicate), so line-by-line matching would miss it, and a
 * comparison is only meaningful in the context of the statement that binds
 * its aliases. Three independent passes run per statement -- alias-qualified,
 * bare-in-an-app_roles-only-subquery, and scalar-subquery-compared-outside --
 * because each catches a shape the others cannot.
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

    // Pass 1: alias- or schema-qualified, e.g. `ar.name = ANY (...)`.
    for (const match of statement.matchAll(/\b([a-z_][a-z0-9_]*)\.name\b/gi)) {
      const qualifier = match[1].toLowerCase();
      if (!aliases.has(qualifier)) continue;

      const after = statement.slice((match.index ?? 0) + match[0].length);
      if (NAME_COMPARES_TO_LITERAL.test(after)) {
        hitLines.add(lineAt(base + (match.index ?? 0)));
      }
    }

    // Passes 2 and 3 share the same app_roles-rooted subqueries.
    for (const { body, bodyStart, afterParen, afterStart } of appRolesRootedSubqueries(statement)) {
      // Pass 2: bare `name`, subquery reaches only app_roles.
      if (APP_ROLES_ONLY_NO_JOIN.test(body)) {
        for (const match of body.matchAll(/(?<!\.)\bname\b/gi)) {
          const after = body.slice((match.index ?? 0) + match[0].length);
          if (NAME_COMPARES_TO_LITERAL.test(after)) {
            hitLines.add(lineAt(base + bodyStart + (match.index ?? 0)));
          }
        }
      }

      // Pass 3: the subquery's result (its selected name) compared outside.
      if (SELECTS_NAME_FIRST.test(body) && NAME_COMPARES_TO_LITERAL.test(afterParen)) {
        hitLines.add(lineAt(base + afterStart));
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

    it('catches bare name in a subquery whose only table is app_roles (Miss 1)', () => {
      // 20251222000001_fix_rbac_rls_policies.sql's is_super_admin(): `name`
      // is unqualified because the subquery's sole FROM is app_roles.
      const sql = `CREATE OR REPLACE FUNCTION is_super_admin()
        RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
          SELECT EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND p.role_id IN (
                SELECT id FROM app_roles WHERE name = 'super_admin'
              )
          );
        $$;`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('catches a scalar subquery selecting the name, compared outside (Miss 2)', () => {
      // 20260118090000_add_hybrid_payments.sql's storage.objects policy:
      // the subquery's own result -- not a column inside it -- is what gets
      // compared to the literal list, after the subquery's closing paren.
      const sql = `CREATE POLICY "x" ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = 'payment-proofs' AND
          (
            SELECT ar.name FROM app_roles ar
            JOIN profiles pr ON pr.role_id = ar.id
            WHERE pr.id = auth.uid()
          ) IN ('super_admin', 'chairman')
        );`;
      expect(hardcodedRoleNameReferences(sql)).toHaveLength(1);
    });

    it('ignores the same bare-name-in-app_roles-subquery shape when it feeds a role_permissions seed via CTE', () => {
      // 20260119000101_add_personnel_perms.sql: structurally identical to
      // Miss 1 (bare `name`, subquery rooted solely at app_roles), but this
      // one feeds an INSERT INTO role_permissions rather than an
      // authorization predicate -- the documented CORE.md §6 convention,
      // just with the role/permission lookups pulled into CTEs first.
      const sql = `WITH roles AS (
          SELECT id, name FROM public.app_roles WHERE name IN ('admin', 'chairman')
        ),
        perms AS (
          SELECT id, name FROM public.app_permissions WHERE name IN ('view_vendors')
        )
        INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r CROSS JOIN perms p;`;
      expect(hardcodedRoleNameReferences(sql)).toEqual([]);
    });

    it('ignores both new forms inside comments', () => {
      const lineComment = `-- (SELECT id FROM app_roles WHERE name = 'super_admin')`;
      const blockComment = `/* (SELECT ar.name FROM app_roles ar JOIN profiles pr ON pr.role_id = ar.id WHERE pr.id = auth.uid()) IN ('super_admin', 'chairman') */`;

      expect(hardcodedRoleNameReferences(lineComment)).toEqual([]);
      expect(hardcodedRoleNameReferences(blockComment)).toEqual([]);
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
