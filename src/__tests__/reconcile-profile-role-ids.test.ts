import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #192 (epic #182), immediately before #193 renames `profiles.role`.
 * `20260905010000_reconcile_profile_role_ids.sql` is the proof that no
 * profile still depends on the auth-provider.tsx reverse lookup (lines
 * 288-301) that #193 removes: for every profile holding a legacy `role`
 * value with no `role_id`, it backfills what resolves safely and hard-fails,
 * naming the affected accounts by id and email, for anything left over.
 *
 * Live data will never exercise the failure branch -- the coordinator
 * measured the population this migration targets (legacy role set AND
 * role_id IS NULL) at zero rows on 2026-09-05, and all three legacy-role
 * profiles map cleanly. So this file, like
 * `legacy-role-migration-ratchet.test.ts` and `legacy-policies-part-b.test.ts`,
 * is a structural assertion over the migration text rather than a database
 * test: nothing here connects to a database. What it proves is that the
 * migration as written both backfills and can fail loudly -- the only way to
 * exercise the failure branch at all, since production data cannot.
 *
 * Every check below that claims to guard a specific defect is paired with a
 * mutation test that applies exactly that defect to the REAL text extracted
 * from the migration (never a hand-typed literal standing in for it), then
 * asserts the same predicate the real check uses now reports the opposite
 * answer. A predicate that cannot be flipped by its own named mutation is
 * not a check -- QA proved this file had three practicing that.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MIGRATION_FILE = '20260905010000_reconcile_profile_role_ids.sql';

/** Normalised to LF so a CRLF checkout does not fail literal-text assertions. */
const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);

/**
 * The executable body only (the first BEGIN;...COMMIT; block). Everything
 * before it is the header and the rollback comment block, and the rollback
 * block legitimately restates the backfill predicate -- a check that scanned
 * the whole file could never distinguish "the guard exists" from "the
 * rollback comment mentions it".
 */
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';

/** Active SQL with `--` line comments stripped, so section prose cannot satisfy a check. */
const activeStatements = activeSql.replace(/--[^\n]*/g, '');

/** The rollback comment block: from its `-- ROLLBACK:` marker to the real `BEGIN;`. */
const rollback = migration.slice(migration.indexOf('-- ROLLBACK:'), migration.indexOf('\nBEGIN;'));

// ---------------------------------------------------------------------------
// Shared parsing helpers -- used by BOTH the real assertions and their
// mutation tests, so a mutation test is checking "does the real predicate
// flip", not "does a second, independently-written regex happen to differ".
// ---------------------------------------------------------------------------

/** Every top-level `DO $$ ... $$;` block in `sql`, in source order. */
function extractDoBlocks(sql: string): string[] {
  return sql.match(/DO \$\$[\s\S]*?\$\$;/gi) ?? [];
}

/** The one DO block that raises the hard failure (step 2, the guard). */
function extractGuardBlock(sql: string): string {
  return extractDoBlocks(sql).find((block) => /RAISE\s+EXCEPTION/i.test(block)) ?? '';
}

/** The one DO block that performs the backfill and records its own provenance (step 1). */
function extractBackfillBlock(sql: string): string {
  return extractDoBlocks(sql).find((block) => /RAISE\s+NOTICE/i.test(block)) ?? '';
}

/** The `CASE p.role ... END` mapping expression. */
function extractMappingBlock(sql: string): string {
  return sql.match(/CASE\s+p\.role[\s\S]*?END/i)?.[0] ?? '';
}

/** True if `sql` (already comment-stripped) contains an executable RAISE EXCEPTION. */
function containsRaiseException(sql: string): boolean {
  return /RAISE\s+EXCEPTION/i.test(sql);
}

/** True if the mapping block has a WHEN branch for 'security_officer'. */
function mapsSecurityOfficer(mappingBlock: string): boolean {
  return /WHEN\s+'security_officer'/i.test(mappingBlock);
}

/** Number of WHEN branches in the mapping block. */
function whenBranchCount(mappingBlock: string): number {
  return (mappingBlock.match(/WHEN\s+'/gi) ?? []).length;
}

/** Index one past the ')' matching the '(' at `openIdx`. Throws if unbalanced. */
function matchParen(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  throw new Error(`unbalanced parens in: ${src.slice(openIdx, openIdx + 80)}...`);
}

/** Splits a comma-separated argument list on top-level commas only (parens tracked). */
function splitTopLevel(src: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') depth--;
    else if (src[i] === ',' && depth === 0) {
      parts.push(src.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(src.slice(start));
  return parts.map((s) => s.trim());
}

/**
 * The value expression passed as `string_agg`'s FIRST argument inside the
 * guard block -- i.e. what actually lands in the listing, as opposed to text
 * anywhere else in the block (an `ORDER BY email` clause, or a `'no email'`
 * fallback literal, both of which can be present while the concatenation
 * itself no longer includes the email column). Returns '' if no string_agg
 * call is found.
 */
function guardListingValueExpr(guardBlock: string): string {
  const callIdx = guardBlock.search(/string_agg\s*\(/i);
  if (callIdx === -1) return '';
  const openIdx = guardBlock.indexOf('(', callIdx);
  const closeIdx = matchParen(guardBlock, openIdx);
  const argsRaw = guardBlock.slice(openIdx + 1, closeIdx - 1);
  return splitTopLevel(argsRaw)[0] ?? '';
}

/**
 * The variable names in `SELECT ... INTO a, b` inside the guard block, as
 * [countVar, accountsVar]. Returns null if the pattern isn't found.
 */
function guardIntoVars(guardBlock: string): [string, string] | null {
  const m = guardBlock.match(/INTO\s+(\w+)\s*,\s*(\w+)/i);
  return m ? [m[1], m[2]] : null;
}

/**
 * The argument list `RAISE EXCEPTION` passes after its format-string
 * literal, as raw identifiers (e.g. ['v_count', 'v_accounts']). Returns []
 * if no RAISE EXCEPTION with a trailing argument list is found.
 */
function guardRaiseArgs(guardBlock: string): string[] {
  // Skip past RAISE EXCEPTION, then the single quoted format string
  // (accounting for '' as an escaped quote), then take everything up to the
  // terminating semicolon as the argument list.
  const m = guardBlock.match(/RAISE\s+EXCEPTION\s*(?:'(?:[^']|'')*')\s*,([\s\S]*?);/i);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

describe('reconcile-profile-role-ids migration', () => {
  it('exists with a timestamp newer than the newest migration on master at authoring time', () => {
    // 20260905003000_close_anonymous_table_reads.sql was newest when this slice started.
    expect(MIGRATION_FILE > '20260905003000').toBe(true);
  });

  it('contains a backfill: an UPDATE that sets role_id from app_roles for NULL role_id rows', () => {
    expect(activeStatements).toMatch(
      /UPDATE\s+public\.profiles\s+p\s*\n?\s*SET\s+role_id\s*=\s*ar\.id/i
    );
    expect(activeStatements).toMatch(/FROM\s+public\.app_roles\s+ar/i);
    expect(activeStatements).toMatch(/p\.role_id\s+IS\s+NULL/i);
  });

  it('the backfill records its own provenance: a NOTICE naming the ids it touched', () => {
    const backfillBlock = extractBackfillBlock(activeStatements);
    expect(backfillBlock).not.toBe('');
    expect(backfillBlock).toMatch(/RETURNING\s+p\.id/i);
    expect(backfillBlock).toMatch(/string_agg\s*\(\s*id::text/i);
    expect(backfillBlock).toMatch(/RAISE\s+NOTICE/i);
  });

  it('contains a failure branch that RAISEs an EXCEPTION, not merely a NOTICE', () => {
    expect(containsRaiseException(activeStatements)).toBe(true);
  });

  it('the failure branch is guarded on the unresolved population: role_id NULL AND role NOT NULL', () => {
    // The guard's own query must target exactly this population, not "any
    // NULL role_id" (which would also catch normal pending signups).
    const guardBlock = extractGuardBlock(activeStatements);
    expect(guardBlock).toMatch(/role_id\s+IS\s+NULL/i);
    expect(guardBlock).toMatch(/role\s+IS\s+NOT\s+NULL/i);
  });

  describe('the failure branch names the accounts, not just a count (D1)', () => {
    const guardBlock = extractGuardBlock(activeStatements);
    const intoVars = guardIntoVars(guardBlock);

    it('parses the guard\'s SELECT ... INTO count and accounts variables', () => {
      expect(intoVars).not.toBeNull();
    });

    it('the string_agg value expression (what actually lands in the listing) includes email', () => {
      // Not "email appears somewhere in the block" -- an ORDER BY email clause
      // or a 'no email' fallback literal would satisfy that even if the
      // concatenation itself dropped the column. This checks the specific
      // expression that becomes the listing text.
      const valueExpr = guardListingValueExpr(guardBlock);
      expect(valueExpr).not.toBe('');
      expect(valueExpr).toMatch(/\bemail\b/i);
    });

    it('the RAISE EXCEPTION actually passes the accounts variable, not the count twice', () => {
      expect(intoVars).not.toBeNull();
      const [, accountsVar] = intoVars!;
      const raiseArgs = guardRaiseArgs(guardBlock);
      expect(raiseArgs.length).toBeGreaterThanOrEqual(2);
      expect(raiseArgs).toContain(accountsVar);
    });
  });

  it('mirrors the August backfill mapping exactly for the three resolvable legacy values', () => {
    const mappingBlock = extractMappingBlock(activeStatements);
    expect(mappingBlock).toMatch(/WHEN\s+'admin'\s+THEN\s+'super_admin'/i);
    expect(mappingBlock).toMatch(/WHEN\s+'chairman'\s+THEN\s+'chairman'/i);
    expect(mappingBlock).toMatch(/WHEN\s+'financial_secretary'\s+THEN\s+'financial_officer'/i);
  });

  it('does not map security_officer -- exactly three WHEN branches, none of them it', () => {
    const mappingBlock = extractMappingBlock(activeStatements);
    expect(mapsSecurityOfficer(mappingBlock)).toBe(false);
    // Confirms shape, not just absence of the literal WHEN clause: a defect
    // that quietly re-added the branch would still leave the string
    // 'security_officer' present in trailing prose/comments elsewhere.
    expect(whenBranchCount(mappingBlock)).toBe(3);
  });

  it('states the security_officer reasoning in the file, restated rather than only cross-referenced', () => {
    // The header must explain the trigger-default reasoning in its own words,
    // not just point at the August migration and stop.
    expect(migration).toMatch(/security_officer/i);
    expect(migration.toLowerCase()).toMatch(/trigger.*default|default.*trigger/);
    expect(migration.toLowerCase()).toMatch(/accidental|escalation|permanent/);
  });

  describe('the rollback comment block (D3)', () => {
    it('exists, is entirely commented, and precedes the active BEGIN/COMMIT', () => {
      expect(rollback.length).toBeGreaterThan(0);
      expect(rollback).toMatch(/-- ROLLBACK:/);
      const rollbackBody = rollback.slice(rollback.indexOf('\n'));
      const sqlLines = rollbackBody
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of sqlLines) {
        expect(line.startsWith('--')).toBe(true);
      }
      const rollbackIdx = migration.indexOf('-- ROLLBACK:');
      const beginIdx = migration.indexOf('\nBEGIN;');
      expect(beginIdx).toBeGreaterThan(rollbackIdx);
    });

    it('contains a real reverting statement scoped by explicit id, not just prose', () => {
      expect(rollback).toMatch(/UPDATE public\.profiles/);
      expect(rollback).toMatch(/SET role_id = NULL/);
      expect(rollback).toMatch(/WHERE id IN/i);
    });

    it('does NOT scope by matching role_id against the mapped app_roles value', () => {
      // This is the exact defect QA found: a predicate like
      // "p.role_id = ar.id AND ar.name = CASE p.role ..." matches every
      // profile that already held the correct value before this migration
      // ran, not only the ones it wrote -- proven disjoint from what step 1
      // actually touched (0 rows) against the live database on 2026-09-05.
      expect(rollback).not.toMatch(/p\.role_id\s*=\s*ar\.id/i);
      expect(rollback).not.toMatch(/FROM\s+public\.app_roles/i);
    });

    it('tells the operator to source the id list from the forward run\'s own NOTICE', () => {
      expect(rollback.toLowerCase()).toMatch(/notice/);
    });
  });

  describe('mutation checks -- does the real predicate flip on the real defect? (D2)', () => {
    it('deleting RAISE EXCEPTION (turning it into RAISE NOTICE) flips the failure-branch check', () => {
      // Sanity: the real, unmutated text passes.
      expect(containsRaiseException(activeStatements)).toBe(true);
      // The actual mutation QA named: RAISE EXCEPTION -> RAISE NOTICE.
      const mutated = activeStatements.replace(/RAISE\s+EXCEPTION/gi, 'RAISE NOTICE');
      expect(containsRaiseException(mutated)).toBe(false);
    });

    it('adding a WHEN branch for security_officer flips the exclusion check', () => {
      const mappingBlock = extractMappingBlock(activeStatements);
      expect(mapsSecurityOfficer(mappingBlock)).toBe(false); // real text: sanity check
      const mutated = mappingBlock.replace(
        "WHEN 'financial_secretary' THEN 'financial_officer'",
        "WHEN 'financial_secretary' THEN 'financial_officer'\n      WHEN 'security_officer'    THEN 'security_officer'"
      );
      expect(mapsSecurityOfficer(mutated)).toBe(true);
      expect(whenBranchCount(mutated)).toBe(4);
    });

    it('dropping email from the string_agg value expression flips the email-in-listing check (D1, mutation A)', () => {
      const guardBlock = extractGuardBlock(activeStatements);
      const realValueExpr = guardListingValueExpr(guardBlock);
      expect(realValueExpr).toMatch(/\bemail\b/i); // sanity check on real text

      // The exact mutation QA demonstrated: keep ORDER BY email (and the
      // 'no email' fallback text lives on elsewhere too) but drop the column
      // from what is actually concatenated into the listing.
      const mutatedGuardBlock = guardBlock.replace(
        "string_agg(id || ' <' || COALESCE(email, 'no email') || '>', ', ' ORDER BY email)",
        "string_agg(id::text, ', ' ORDER BY email)"
      );
      const mutatedValueExpr = guardListingValueExpr(mutatedGuardBlock);
      expect(mutatedValueExpr).not.toMatch(/\bemail\b/i);
    });

    it('raising v_count twice instead of v_count, v_accounts flips the accounts-surfaced check (D1, mutation B)', () => {
      const guardBlock = extractGuardBlock(activeStatements);
      const intoVars = guardIntoVars(guardBlock);
      expect(intoVars).not.toBeNull();
      const [, accountsVar] = intoVars!;
      const realRaiseArgs = guardRaiseArgs(guardBlock);
      expect(realRaiseArgs).toContain(accountsVar); // sanity check on real text

      // The exact mutation QA demonstrated: compute v_accounts but never
      // surface it, raising the count twice instead.
      const mutatedGuardBlock = guardBlock.replace(
        `v_count, ${accountsVar};`,
        'v_count, v_count;'
      );
      const mutatedRaiseArgs = guardRaiseArgs(mutatedGuardBlock);
      expect(mutatedRaiseArgs).not.toContain(accountsVar);
    });

    it('restoring the value-matching rollback predicate flips the rollback-scoping check (D3)', () => {
      expect(rollback).not.toMatch(/p\.role_id\s*=\s*ar\.id/i); // sanity check on real text
      const mutatedRollback = rollback.replace(
        'WHERE id IN (',
        'WHERE p.role_id = ar.id\n--   AND ('
      );
      // Even a partial reintroduction of the value-matching predicate should
      // be caught by the same check the real assertion uses.
      expect(mutatedRollback).toMatch(/p\.role_id\s*=\s*ar\.id/i);
    });
  });
});
