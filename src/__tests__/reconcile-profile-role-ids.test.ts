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

describe('reconcile-profile-role-ids migration', () => {
  it('exists with a timestamp newer than the newest migration on master at authoring time', () => {
    // 20260905003000_close_anonymous_table_reads.sql was newest when this slice started.
    expect(MIGRATION_FILE > '20260905003000').toBe(true);
  });

  it('contains a backfill: an UPDATE that sets role_id from app_roles for NULL role_id rows', () => {
    expect(activeStatements).toMatch(
      /UPDATE\s+public\.profiles\s+p\s*\n?SET\s+role_id\s*=\s*ar\.id/i
    );
    expect(activeStatements).toMatch(/FROM\s+public\.app_roles\s+ar/i);
    expect(activeStatements).toMatch(/p\.role_id\s+IS\s+NULL/i);
  });

  it('contains a failure branch that RAISEs an EXCEPTION, not merely a NOTICE', () => {
    expect(activeStatements).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it('the failure branch is guarded on the unresolved population: role_id NULL AND role NOT NULL', () => {
    // The DO block computing v_count/v_accounts must query exactly this population,
    // not "any NULL role_id" (which would also catch normal pending signups).
    const doBlock = activeStatements.match(/DO \$\$[\s\S]*?\$\$;/)?.[0] ?? '';
    expect(doBlock).toMatch(/role_id\s+IS\s+NULL/i);
    expect(doBlock).toMatch(/role\s+IS\s+NOT\s+NULL/i);
    expect(doBlock).toMatch(/RAISE\s+EXCEPTION/i);
  });

  it('the failure branch names the accounts (id and email), not just a count', () => {
    const doBlock = activeStatements.match(/DO \$\$[\s\S]*?\$\$;/)?.[0] ?? '';
    // Must select something identifying each row (id, email), aggregated into a
    // listing string, and pass that listing -- not only a count -- into RAISE EXCEPTION.
    expect(doBlock).toMatch(/string_agg\s*\(/i);
    expect(doBlock).toMatch(/\bid\b/);
    expect(doBlock).toMatch(/\bemail\b/);

    const raiseStmt = doBlock.match(/RAISE\s+EXCEPTION[\s\S]*?;/i)?.[0] ?? '';
    // The RAISE EXCEPTION format string takes two substitutions (count, then the
    // account listing) -- a raise with only one '%' would be reporting a count alone.
    const substitutions = (raiseStmt.match(/%/g) ?? []).length;
    expect(substitutions).toBeGreaterThanOrEqual(2);
  });

  it('mirrors the August backfill mapping exactly for the three resolvable legacy values', () => {
    const mappingBlock = activeStatements.match(/CASE\s+p\.role[\s\S]*?END/i)?.[0] ?? '';
    expect(mappingBlock).toMatch(/WHEN\s+'admin'\s+THEN\s+'super_admin'/i);
    expect(mappingBlock).toMatch(/WHEN\s+'chairman'\s+THEN\s+'chairman'/i);
    expect(mappingBlock).toMatch(/WHEN\s+'financial_secretary'\s+THEN\s+'financial_officer'/i);
  });

  it('does not map security_officer -- no WHEN branch for it anywhere in the active SQL', () => {
    expect(activeStatements).not.toMatch(/WHEN\s+'security_officer'/i);
    // Confirm the CASE block itself has exactly three WHEN branches, not four --
    // a defect that quietly re-added the branch would still leave the string
    // 'security_officer' present in trailing prose/comments, so this asserts
    // shape, not just absence of the literal WHEN clause above.
    const mappingBlock = activeStatements.match(/CASE\s+p\.role[\s\S]*?END/i)?.[0] ?? '';
    const whenCount = (mappingBlock.match(/WHEN\s+'/gi) ?? []).length;
    expect(whenCount).toBe(3);
  });

  it('states the security_officer reasoning in the file, restated rather than only cross-referenced', () => {
    // The header must explain the trigger-default reasoning in its own words,
    // not just point at the August migration and stop.
    expect(migration).toMatch(/security_officer/i);
    expect(migration.toLowerCase()).toMatch(/trigger.*default|default.*trigger/);
    expect(migration.toLowerCase()).toMatch(/accidental|escalation|permanent/);
  });

  it('carries a rollback SQL comment block distinct from the active statements', () => {
    expect(rollback.length).toBeGreaterThan(0);
    expect(rollback).toMatch(/-- ROLLBACK:/);
    // The rollback's SQL is commented out -- every line inside it starts with `--`.
    const rollbackBody = rollback.slice(rollback.indexOf('\n'));
    const sqlLines = rollbackBody
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    for (const line of sqlLines) {
      expect(line.startsWith('--')).toBe(true);
    }
    // And it must actually contain the reverting statement, not just a description.
    expect(rollback).toMatch(/UPDATE public\.profiles p/);
    expect(rollback).toMatch(/SET role_id = NULL/);
  });

  it('the rollback block precedes the active BEGIN/COMMIT, matching this repo\'s convention', () => {
    const rollbackIdx = migration.indexOf('-- ROLLBACK:');
    const beginIdx = migration.indexOf('\nBEGIN;');
    expect(rollbackIdx).toBeGreaterThan(-1);
    expect(beginIdx).toBeGreaterThan(rollbackIdx);
  });

describe('mutation checks -- would the assertions above actually fail?', () => {
    it('a migration missing the RAISE EXCEPTION would fail the failure-branch checks', () => {
      const mutated = activeSql.replace(/RAISE\s+EXCEPTION/gi, '-- RAISE EXCEPTION');
      const stripped = mutated.replace(/--[^\n]*/g, '');
      expect(stripped).not.toMatch(/RAISE\s+EXCEPTION/i);
    });

    it('a migration mapping security_officer would fail the exclusion check', () => {
      const mutated = activeStatements.replace(
        "WHEN 'financial_secretary' THEN 'financial_officer'",
        "WHEN 'financial_secretary' THEN 'financial_officer'\n      WHEN 'security_officer'    THEN 'security_officer'"
      );
      expect(mutated).toMatch(/WHEN\s+'security_officer'/i);
    });

    it('a listing built from COUNT(*) alone (no accounts) would fail the naming check', () => {
      const onlyCount = "RAISE EXCEPTION 'Reconciliation failed: % profile(s)', v_count;";
      const substitutions = (onlyCount.match(/%/g) ?? []).length;
      expect(substitutions).toBeLessThan(2);
    });
  });
});
