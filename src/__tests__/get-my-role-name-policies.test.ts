import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Issue #190 (epic #182) retargets the 97 RLS policies across 36 tables that
 * call `get_my_role()` -- which returns the legacy `user_role` enum -- to
 * `get_my_role_name()`, which returns the RBAC role name. The policies are not
 * broken: they already resolve through `profiles.role_id -> app_roles.name`.
 * They must change only because #194 drops the enum that is `get_my_role()`'s
 * return type.
 *
 * ## What this file is actually guarding
 *
 * ADR-0007 hazard 1. `get_my_role()` collapses distinct RBAC roles into shared
 * legacy buckets -- `vice_chairman` returns `'chairman'` and
 * `financial_officer` returns `'financial_secretary'` -- so
 * `get_my_role() = ANY (ARRAY['admin','chairman'])` admits FOUR RBAC roles,
 * not two. Renaming those literals to `('super_admin','chairman')` silently
 * revokes every vice_chairman across 36 tables and leaves a perfectly
 * well-formed policy behind. Nothing structural catches that: not a type
 * check, not a syntax check, not "get_my_role() is gone", and not reading the
 * diff, because the wrong migration and the right one differ by one absent
 * word in each of 81 statements.
 *
 * `vice_chairman` also has zero holders today, so the collapse would revoke
 * access nobody currently exercises and would pass every functional check as
 * well.
 *
 * The assertions below are therefore built the only way that bites: an
 * EXPANSION table stated literally here, and every policy's new literal set
 * checked to be the expansion of the legacy set it actually had -- where "the
 * legacy set it actually had" is read from
 * `docs/validation/get-my-role-policies.json`, the pg_policies capture taken
 * from the live cloud database, NOT from the migration under test. Editing the
 * migration alone can therefore never make this file agree with it.
 *
 * `vice_chairman` presence is then asserted a second time, separately and by
 * count, over the 81 policies whose legacy set contained `chairman` or
 * `financial_secretary`. That is the single failure this whole slice exists to
 * prevent, so it gets an assertion that names it rather than only being
 * implied by the general one.
 *
 * These are structural assertions over migration text; nothing here connects
 * to a database, the same approach as `legacy-policies-part-a.test.ts` and
 * `legacy-policies-part-b.test.ts`.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

const MIGRATION_FILE = '20260906010000_policies_follow_get_my_role_name.sql';

/**
 * Normalised to LF: the assertions below match multi-line statements
 * literally, and a CRLF checkout on Windows would otherwise fail every one of
 * them for a reason that has nothing to do with the policies.
 */
const migration = readFileSync(
  path.join(repoRoot, 'supabase', 'migrations', MIGRATION_FILE),
  'utf8'
).replace(/\r\n/g, '\n');

/**
 * The executable body only. Everything above `BEGIN;` is the header and the
 * rollback block, and the rollback block legitimately quotes the old
 * `get_my_role()` predicates verbatim -- so a check for legacy references that
 * scanned the whole file could never pass. The `^`-anchored `BEGIN;` skips the
 * commented `-- BEGIN;` that opens the rollback block.
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/**
 * The rollback block only, sliced from its own `-- ROLLBACK:` marker rather
 * than from the top of the file. Slicing from offset zero would pull in the
 * header, which quotes `get_my_role()` and every legacy literal in its hazard
 * note -- so assertions about the rollback block's *contents* would be
 * satisfied by the header and would pass no matter what the rollback block
 * said. That exact mistake was made in part A of this epic.
 */
const rollback = migration.slice(
  migration.indexOf('-- ROLLBACK:'),
  migration.indexOf('\nBEGIN;')
);

interface CapturedPolicy {
  cmd: string;
  qual: string;
  roles: string;
  tablename: string;
  policyname: string;
  schemaname: string;
  with_check: string;
}

const capture = JSON.parse(
  readFileSync(
    path.join(repoRoot, 'docs', 'validation', 'get-my-role-policies.json'),
    'utf8'
  )
) as { policyCount: number; tableCount: number; policies: CapturedPolicy[] };

/**
 * The five substitutions, stated literally. This is the decision the migration
 * makes, restated independently of it.
 *
 * `legacy` is the DISTINCT SORTED set of `'<literal>'::user_role` values a
 * policy's predicate compared against before this migration. `expanded` is
 * every RBAC role name that `get_my_role()` would have mapped onto one of
 * those literals -- i.e. the bucket opened up, not renamed:
 *
 *     'admin'               -> 'super_admin'
 *     'chairman'            -> 'chairman', 'vice_chairman'
 *     'financial_secretary' -> 'financial_officer'
 *     'security_officer'    -> 'security_officer'
 *
 * `count` is the number of the 97 policies in that group, measured live on
 * 2026-09-05 (45 + 29 + 14 + 7 + 2 = 97). It is pinned so that a policy
 * quietly moving between groups fails here rather than passing as "still 97".
 */
const EXPANSIONS: ReadonlyArray<{
  legacy: readonly string[];
  expanded: readonly string[];
  count: number;
}> = [
  {
    legacy: ['admin', 'chairman', 'financial_secretary'],
    expanded: ['super_admin', 'chairman', 'vice_chairman', 'financial_officer'],
    count: 45,
  },
  {
    legacy: ['admin', 'chairman'],
    expanded: ['super_admin', 'chairman', 'vice_chairman'],
    count: 29,
  },
  {
    legacy: ['admin'],
    expanded: ['super_admin'],
    count: 14,
  },
  {
    legacy: ['admin', 'chairman', 'financial_secretary', 'security_officer'],
    expanded: [
      'super_admin',
      'chairman',
      'vice_chairman',
      'financial_officer',
      'security_officer',
    ],
    count: 7,
  },
  {
    legacy: ['security_officer'],
    expanded: ['security_officer'],
    count: 2,
  },
];

/** The legacy literals whose bucket contained `vice_chairman` or `financial_officer`. */
const COLLAPSED_LEGACY_LITERALS = ['chairman', 'financial_secretary'] as const;

/** `[table, policy]` joined, the identity used throughout. */
function key(table: string, policy: string): string {
  return `${table}.${policy}`;
}

/** Distinct, sorted `'<x>'::user_role` literals in a captured predicate pair. */
function legacyLiterals(p: CapturedPolicy): string[] {
  const source = `${p.qual} ${p.with_check}`;
  return [...new Set([...source.matchAll(/'([a-z_]+)'::user_role/g)].map((m) => m[1]))].sort();
}

/** Distinct, sorted `'<x>'::text` literals in a rewritten statement. */
function newLiterals(statement: string): string[] {
  return [...new Set([...statement.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]))].sort();
}

function expansionFor(p: CapturedPolicy): (typeof EXPANSIONS)[number] {
  const legacy = legacyLiterals(p).join(',');
  const row = EXPANSIONS.find((e) => e.legacy.join(',') === legacy);
  if (!row) {
    throw new Error(
      `${key(p.tablename, p.policyname)} compares against an unmapped legacy set: [${legacy}]`
    );
  }
  return row;
}

/**
 * The `ALTER POLICY` statements in the executable body, parsed by splitting on
 * the statement keyword and taking each chunk up to its terminating `;`.
 *
 * Splitting rather than regex-matching whole statements is deliberate: a
 * pattern that failed to match a malformed statement would silently reduce the
 * count instead of failing loudly, and the count is one of the things being
 * asserted. No captured predicate contains a `;` (verified against the
 * capture), so the first `;` in a chunk is always its terminator -- including
 * for the seven two-clause statements, where the `USING (...)` line
 * deliberately carries no `;`.
 */
const alterStatements = new Map<string, string>();
const alterStatementList: string[] = [];

for (const chunk of activeSql.split(/^ALTER POLICY /m).slice(1)) {
  const end = chunk.indexOf(';');
  const statement = `ALTER POLICY ${chunk.slice(0, end + 1)}`;
  alterStatementList.push(statement);

  const head = statement.match(/^ALTER POLICY "([^"]+)" ON public\.([a-z_]+)\n/);
  if (!head) {
    throw new Error(`unparseable ALTER POLICY statement:\n${statement}`);
  }
  alterStatements.set(key(head[2], head[1]), statement);
}

describe('#190 -- 97 RLS policies follow get_my_role_name()', () => {
  describe('the capture this migration is derived from', () => {
    it('is the 97 policies across 36 tables the issue scopes', () => {
      expect(capture.policies).toHaveLength(97);
      expect(capture.policyCount).toBe(97);
      expect(new Set(capture.policies.map((p) => p.tablename)).size).toBe(36);
      expect(capture.tableCount).toBe(36);
    });

    it('reduces to exactly the five literal sets pinned above, with the pinned counts', () => {
      const measured = new Map<string, number>();
      for (const p of capture.policies) {
        const k = legacyLiterals(p).join(',');
        measured.set(k, (measured.get(k) ?? 0) + 1);
      }

      const pinned = new Map(EXPANSIONS.map((e) => [e.legacy.join(','), e.count]));

      expect([...measured.entries()].sort()).toEqual([...pinned.entries()].sort());
      expect([...measured.values()].reduce((a, b) => a + b, 0)).toBe(97);
    });
  });

  describe('coverage', () => {
    it('contains exactly 97 ALTER POLICY statements', () => {
      expect(alterStatementList).toHaveLength(97);
      expect((activeSql.match(/^ALTER POLICY /gm) ?? [])).toHaveLength(97);
    });

    it('covers exactly the 97 (table, policy) pairs in the capture -- none missed, none invented', () => {
      const expected = capture.policies.map((p) => key(p.tablename, p.policyname)).sort();
      const actual = [...alterStatements.keys()].sort();

      expect(actual).toEqual(expected);
      expect(alterStatements.size).toBe(97);
    });

    it('uses ALTER POLICY only -- no DROP or CREATE, which would risk the policy roles', () => {
      // 60 of the 97 are TO {authenticated} and 37 are TO {public}. A
      // DROP + CREATE that assumed one would silently change who 37 policies
      // apply to -- the mistake #186 made. ALTER POLICY cannot.
      expect(activeSql).not.toMatch(/\bDROP POLICY\b/);
      expect(activeSql).not.toMatch(/\bCREATE POLICY\b/);
    });

    it('never names a role in a statement, so no policy can have its roles changed', () => {
      for (const statement of alterStatementList) {
        expect(statement).not.toMatch(/TO /);
      }
      expect(activeSql).not.toMatch(/\bTO (authenticated|public|anon|service_role)\b/);
    });

    it('is wrapped in a single BEGIN/COMMIT transaction', () => {
      expect((migration.match(/^BEGIN;$/gm) ?? [])).toHaveLength(1);
      expect((migration.match(/^COMMIT;$/gm) ?? [])).toHaveLength(1);
      expect(activeSql.startsWith('BEGIN;')).toBe(true);
      expect(activeSql.endsWith('COMMIT;')).toBe(true);
    });
  });

  describe('the bucket expansion -- ADR-0007 hazard 1', () => {
    it.each(capture.policies.map((p) => [key(p.tablename, p.policyname), p] as const))(
      '%s expands its legacy bucket rather than renaming it',
      (k, p) => {
        const statement = alterStatements.get(k);
        expect(statement, `no ALTER POLICY statement for ${k}`).toBeDefined();

        const expansion = expansionFor(p);

        expect(newLiterals(statement as string)).toEqual([...expansion.expanded].sort());
      }
    );

    it('preserves vice_chairman in every one of the 81 policies whose bucket held it', () => {
      const collapsed = capture.policies.filter((p) =>
        legacyLiterals(p).some((lit) =>
          (COLLAPSED_LEGACY_LITERALS as readonly string[]).includes(lit)
        )
      );

      // Measured live: 81 of the 97. Pinned so that a policy dropping out of
      // this population fails here rather than shrinking the check silently.
      expect(collapsed).toHaveLength(81);

      const missing = collapsed
        .map((p) => key(p.tablename, p.policyname))
        .filter((k) => !(alterStatements.get(k) ?? '').includes("'vice_chairman'::text"));

      expect(missing).toEqual([]);
    });

    it('preserves financial_officer in every policy whose bucket held financial_secretary', () => {
      const holders = capture.policies.filter((p) =>
        legacyLiterals(p).includes('financial_secretary')
      );

      expect(holders).toHaveLength(52);

      const missing = holders
        .map((p) => key(p.tablename, p.policyname))
        .filter((k) => !(alterStatements.get(k) ?? '').includes("'financial_officer'::text"));

      expect(missing).toEqual([]);
    });

    it('never introduces a role the legacy bucket did not admit', () => {
      for (const p of capture.policies) {
        const k = key(p.tablename, p.policyname);
        const allowed = new Set(expansionFor(p).expanded);
        for (const literal of newLiterals(alterStatements.get(k) as string)) {
          expect(allowed.has(literal), `${k} newly admits '${literal}'`).toBe(true);
        }
      }
    });

    it('leaves no reference to get_my_role() or the user_role enum in the executable SQL', () => {
      expect(activeSql).not.toMatch(/get_my_role\(\)/);
      expect(activeSql).not.toMatch(/::user_role/);
      expect((activeSql.match(/get_my_role_name\(\)/g) ?? []).length).toBeGreaterThanOrEqual(97);
    });
  });

  describe('clause fidelity', () => {
    it.each(capture.policies.map((p) => [key(p.tablename, p.policyname), p] as const))(
      '%s alters exactly the clauses it has',
      (k, p) => {
        const statement = alterStatements.get(k) as string;

        expect(/\n {2}USING \(/.test(statement), `USING clause for ${k}`).toBe(
          p.qual.length > 0
        );
        expect(/\n {2}WITH CHECK \(/.test(statement), `WITH CHECK clause for ${k}`).toBe(
          p.with_check.length > 0
        );
      }
    );

    it('preserves each predicate whole -- only the role comparison changes', () => {
      // The rewrite is textual, so a predicate carrying extra conditions
      // (`AND (requested_by = auth.uid())`, `(is_active = true) OR ...`) must
      // come through with those conditions intact. Rebuilding the expected new
      // text from the captured old text proves nothing else moved.
      for (const p of capture.policies) {
        const statement = alterStatements.get(key(p.tablename, p.policyname)) as string;
        const expansion = expansionFor(p);

        const rewriteOne = (expr: string): string =>
          expr
            .replace(
              /get_my_role\(\) = ANY \(ARRAY\[[^\]]*\]\)/g,
              `get_my_role_name() = ANY (ARRAY[${expansion.expanded
                .map((r) => `'${r}'::text`)
                .join(', ')}])`
            )
            .replace(
              /get_my_role\(\) = '[a-z_]+'::user_role/g,
              `get_my_role_name() = '${expansion.expanded[0]}'::text`
            );

        const expected = [
          `ALTER POLICY "${p.policyname}" ON public.${p.tablename}`,
          ...(p.qual
            ? [`  USING (${rewriteOne(p.qual)})${p.with_check ? '' : ';'}`]
            : []),
          ...(p.with_check ? [`  WITH CHECK (${rewriteOne(p.with_check)});`] : []),
        ].join('\n');

        expect(statement).toBe(expected);
      }
    });
  });

  describe('rollback block', () => {
    it('is present, commented out, and transactional', () => {
      expect(rollback).toContain('-- ROLLBACK:');
      expect(rollback).toContain('-- BEGIN;');
      expect(rollback).toContain('-- COMMIT;');
      expect(rollback).not.toMatch(/^BEGIN;/m);
      expect(rollback).not.toMatch(/^ALTER POLICY /m);
    });

    it('restores all 97 policies to their captured predicates verbatim', () => {
      expect((rollback.match(/^-- ALTER POLICY /gm) ?? [])).toHaveLength(97);

      for (const p of capture.policies) {
        const expected = [
          `-- ALTER POLICY "${p.policyname}" ON public.${p.tablename}`,
          ...(p.qual ? [`--   USING (${p.qual})${p.with_check ? '' : ';'}`] : []),
          ...(p.with_check ? [`--   WITH CHECK (${p.with_check});`] : []),
        ].join('\n');

        expect(
          rollback.includes(expected),
          `rollback does not restore ${key(p.tablename, p.policyname)} verbatim`
        ).toBe(true);
      }
    });
  });
});
