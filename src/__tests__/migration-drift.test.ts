import { describe, expect, it } from 'vitest';
import {
  compareMigrations,
  isClean,
  mapAppliedRow,
  MANAGEMENT_API_QUERY,
  normalizeMigrationName,
  versionOf,
} from '../../scripts/migration-drift.mjs';

/**
 * Unit tests for the migration-drift comparison logic (#283, #374). Fixture-driven,
 * no filesystem or network access — `compareMigrations` is pure, taking a
 * `Map<version, filename[]>` (the shape `readLocalMigrations` returns) and an array
 * of `{ version, name }` applied rows (the shape the Management API query returns).
 */

function localFixture(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
}

/**
 * Most fixtures below only care about version-based matching, so `name` is left
 * `null` — `compareMigrations` must treat a null/missing name as "no name to match
 * on" rather than crashing or false-matching. Tests that need name-based matching
 * (the rewritten-version case) build applied entries by hand instead.
 */
function appliedFixture(versions: string[]): Array<{ version: string; name: string | null }> {
  return versions.map((version) => ({ version, name: null }));
}

describe('versionOf', () => {
  it('extracts the leading timestamp from a migration filename', () => {
    expect(versionOf('20251206223732_create_profiles_table.sql')).toBe('20251206223732');
  });

  it('extracts the version even when a second timestamp is embedded later in the name', () => {
    // The exact case called out in #283: an applied migration recorded under
    // version 20260815055719 while its filename reads
    // 20260813160000_add_invoice_generation_run_claims.sql — a second, different
    // timestamp embedded in the name. Comparison must use the leading prefix only.
    expect(versionOf('20260813160000_add_invoice_generation_run_claims.sql')).toBe('20260813160000');
  });

  it('returns null for a filename with no leading timestamp', () => {
    expect(versionOf('README.sql')).toBeNull();
  });
});

describe('normalizeMigrationName', () => {
  it('strips the .sql extension and leading timestamp from a disk filename', () => {
    expect(normalizeMigrationName('20260813160000_add_invoice_generation_run_claims.sql')).toBe(
      'add_invoice_generation_run_claims',
    );
  });

  it('strips only the leading timestamp from an applied row name (no extension present)', () => {
    expect(normalizeMigrationName('20260813160000_add_invoice_generation_run_claims')).toBe(
      'add_invoice_generation_run_claims',
    );
  });

  it('collapses a disk filename and a rewritten-version applied name to the same string', () => {
    // The #374 case: same migration, different versions, same underlying name.
    const diskName = normalizeMigrationName('20260813160000_add_invoice_generation_run_claims.sql');
    const appliedName = normalizeMigrationName('20260813160000_add_invoice_generation_run_claims');
    expect(diskName).toBe(appliedName);
  });
});

describe('compareMigrations', () => {
  it('reports no drift when local and applied match exactly', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
      '20251207000000': ['20251207000000_fix_rls_recursion.sql'],
    });
    const applied = appliedFixture(['20251206223732', '20251207000000']);

    const result = compareMigrations(local, applied);

    expect(result.appliedNotOnDisk).toEqual([]);
    expect(result.fileNotApplied).toEqual([]);
    expect(result.duplicateVersions).toEqual([]);
    expect(isClean(result)).toBe(true);
  });

  it('reports a version applied in the database with no file on disk', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
    });
    const applied = appliedFixture(['20251206223732', '20260815055719']);

    const result = compareMigrations(local, applied);

    expect(result.appliedNotOnDisk).toEqual(['20260815055719']);
    expect(result.fileNotApplied).toEqual([]);
    expect(isClean(result)).toBe(false);
  });

  it('reports a file on disk that was never applied', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
      '20260906000000': ['20260906000000_add_widget_column.sql'],
    });
    const applied = appliedFixture(['20251206223732']);

    const result = compareMigrations(local, applied);

    expect(result.appliedNotOnDisk).toEqual([]);
    expect(result.fileNotApplied).toEqual(['20260906000000']);
    expect(isClean(result)).toBe(false);
  });

  it('reports both directions of drift at once, sorted', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
      '20260906000000': ['20260906000000_add_widget_column.sql'],
    });
    const applied = appliedFixture(['20251206223732', '20260101000000', '20260815055719']);

    const result = compareMigrations(local, applied);

    expect(result.appliedNotOnDisk).toEqual(['20260101000000', '20260815055719']);
    expect(result.fileNotApplied).toEqual(['20260906000000']);
    expect(isClean(result)).toBe(false);
  });

  it('names the specific versions that diverge, not just a count', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
    });
    const applied = appliedFixture(['20251206223732', '20260101000000']);

    const result = compareMigrations(local, applied);

    // The failure message must be able to name versions individually — this locks
    // the exact string in place, since a summarized/truncated array would defeat
    // the point of #283 ("Drift detected" alone is useless).
    expect(result.appliedNotOnDisk).toContain('20260101000000');
  });

  it('handles duplicate version prefixes without crashing, and surfaces them separately from drift', () => {
    const local = localFixture({
      '20260811130000': [
        '20260811130000_a_first_migration.sql',
        '20260811130000_a_second_migration.sql',
      ],
    });
    const applied = appliedFixture(['20260811130000']);

    const result = compareMigrations(local, applied);

    // Two files, one applied version: not drift in either direction.
    expect(result.appliedNotOnDisk).toEqual([]);
    expect(result.fileNotApplied).toEqual([]);
    expect(isClean(result)).toBe(true);

    // But it is still worth a warning: exactly one duplicate group, naming both files.
    expect(result.duplicateVersions).toEqual([
      [
        '20260811130000',
        ['20260811130000_a_first_migration.sql', '20260811130000_a_second_migration.sql'],
      ],
    ]);
  });

  it('does not let a duplicate-version warning mask real drift on the same version', () => {
    const local = localFixture({
      '20260811130000': [
        '20260811130000_a_first_migration.sql',
        '20260811130000_a_second_migration.sql',
      ],
    });
    const applied: Array<{ version: string; name: string | null }> = [];

    const result = compareMigrations(local, applied);

    expect(result.fileNotApplied).toEqual(['20260811130000']);
    expect(result.duplicateVersions).toHaveLength(1);
    expect(isClean(result)).toBe(false);
  });

  describe('rewritten-version matching (#374)', () => {
    // The exact case verified live against the database: disk file
    // 20260813160000_add_invoice_generation_run_claims.sql is recorded in the
    // database as version 20260815055719, name
    // 20260813160000_add_invoice_generation_run_claims. Matching by version prefix
    // alone reports this pair as drift TWICE — once as applied-without-file (its
    // recorded version isn't on disk) and once as file-without-applied (its disk
    // version wasn't the one recorded). Name-based matching must collapse it to
    // zero drift in both directions.
    it('reports no drift for a disk/applied pair sharing a normalized name but differing in version', () => {
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
      });
      const applied = [
        { version: '20260815055719', name: '20260813160000_add_invoice_generation_run_claims' },
      ];

      const result = compareMigrations(local, applied);

      expect(result.appliedNotOnDisk).toEqual([]);
      expect(result.fileNotApplied).toEqual([]);
      expect(isClean(result)).toBe(true);
    });

    it('still reports a genuinely unmatched applied entry as applied-without-file alongside a rewritten-version match', () => {
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
      });
      const applied = [
        { version: '20260815055719', name: '20260813160000_add_invoice_generation_run_claims' },
        { version: '20260901000000', name: '20260901000000_totally_unrelated_migration' },
      ];

      const result = compareMigrations(local, applied);

      // The rewritten-version pair matches by name and drops out; the unrelated
      // applied row shares neither version nor name with anything on disk.
      expect(result.appliedNotOnDisk).toEqual(['20260901000000']);
      expect(result.fileNotApplied).toEqual([]);
    });

    it('still reports a genuinely unmatched disk file as file-without-applied alongside a rewritten-version match', () => {
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
        '20260920000000': ['20260920000000_totally_unrelated_migration.sql'],
      });
      const applied = [
        { version: '20260815055719', name: '20260813160000_add_invoice_generation_run_claims' },
      ];

      const result = compareMigrations(local, applied);

      expect(result.appliedNotOnDisk).toEqual([]);
      expect(result.fileNotApplied).toEqual(['20260920000000']);
    });

    it('does not match on name alone when both name and version differ', () => {
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
      });
      const applied = [{ version: '20260815055719', name: '20260815055719_a_different_migration' }];

      const result = compareMigrations(local, applied);

      // Neither version nor name matches — this is real drift in both directions,
      // not a rewritten-version case, and must not be silently collapsed.
      expect(result.appliedNotOnDisk).toEqual(['20260815055719']);
      expect(result.fileNotApplied).toEqual(['20260813160000']);
      expect(isClean(result)).toBe(false);
    });

    it('treats a null applied name as no name to match on, falling back to version only', () => {
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
      });
      const applied = [{ version: '20260813160000', name: null }];

      const result = compareMigrations(local, applied);

      expect(isClean(result)).toBe(true);
    });
  });

  describe('one-to-one pairing (D1 — a name collision must not mask real drift)', () => {
    // QA's verified-live case: two DIFFERENT normalized names each have two disk
    // files but only one applied row apiece. Set-membership matching let that one
    // applied row "cover" both disk files sharing its name, hiding the second,
    // genuinely unapplied file as a false negative. Real values from the live
    // database (see the issue): 20260813091000 and 20260813092000 are on disk,
    // were never applied under any version or name, and must be reported.
    it('reports the second disk file in a name collision as file-without-applied, even though the first matched', () => {
      const local = localFixture({
        '20260813001153': ['20260813001153_revoke_anon_invoice_generation_rpc.sql'],
        '20260813091000': ['20260813091000_revoke_anon_invoice_generation_rpc.sql'],
        '20260813045937': ['20260813045937_harden_invoice_generation_rpc_authorization.sql'],
        '20260813092000': ['20260813092000_harden_invoice_generation_rpc_authorization.sql'],
      });
      const applied = [
        { version: '20260813001153', name: '20260813001153_revoke_anon_invoice_generation_rpc' },
        {
          version: '20260813045937',
          name: '20260813045937_harden_invoice_generation_rpc_authorization',
        },
      ];

      const result = compareMigrations(local, applied);

      // The two versions that exactly match an applied row's version are fine.
      // The two that only share a normalized name with an ALREADY-CONSUMED
      // applied row must NOT be silently matched — one applied row can pair
      // with at most one disk file.
      expect(result.fileNotApplied).toEqual(['20260813091000', '20260813092000']);
      expect(result.appliedNotOnDisk).toEqual([]);
      expect(isClean(result)).toBe(false);
    });

    it('still lets a genuine rewritten-version pair (unique name) match by name when versions differ', () => {
      // Contrast case: only ONE disk file shares this normalized name, so the
      // one-to-one pairing must not become so strict that it breaks the
      // original #374 rewritten-version fix.
      const local = localFixture({
        '20260813160000': ['20260813160000_add_invoice_generation_run_claims.sql'],
      });
      const applied = [
        { version: '20260815055719', name: '20260813160000_add_invoice_generation_run_claims' },
      ];

      const result = compareMigrations(local, applied);

      expect(isClean(result)).toBe(true);
    });
  });

  describe('duplicate-version groups combined with name matching (#374 M10)', () => {
    // A version with two files on disk (a duplicate) where only ONE of the two
    // files' names matches an applied row. The version must still count as
    // matched — checking "does ANY file's name match" (some), not "do ALL files'
    // names match" (every). A `.some` -> `.every` mutation here would wrongly
    // report this version as file-without-applied.
    it('matches a duplicate-version group when only one of its two files has a matching name', () => {
      const local = localFixture({
        '20260811130000': [
          '20260811130000_file_one_unrelated_name.sql',
          '20260811130000_file_two_matching_name.sql',
        ],
      });
      const applied = [
        { version: '20260901000000', name: '20260901000000_file_two_matching_name' },
      ];

      const result = compareMigrations(local, applied);

      expect(result.fileNotApplied).toEqual([]);
      expect(result.appliedNotOnDisk).toEqual([]);
      expect(result.duplicateVersions).toHaveLength(1);
      expect(isClean(result)).toBe(true);
    });
  });
});

describe('MANAGEMENT_API_QUERY', () => {
  // #374 M1: reverting the query to `select version` alone silently resurrects
  // the pre-#374 double-counting bug — the comparison logic would happily accept
  // rows with no `name` field and fall back to version-only matching everywhere.
  // Locking the exact query text catches that revert directly.
  it('selects both version and name, ordered by version', () => {
    expect(MANAGEMENT_API_QUERY).toBe(
      'select version, name from supabase_migrations.schema_migrations order by version',
    );
  });
});

describe('mapAppliedRow', () => {
  // #374 M14: hardcoding `name: null` in the row mapper passed every prior test
  // silently, because none of them exercised the mapper itself with a real name
  // present. These assert `name` actually survives the trip from a raw row.
  it('carries the name through when present', () => {
    expect(mapAppliedRow({ version: 20260813001153, name: '20260813001153_some_migration' })).toEqual(
      { version: '20260813001153', name: '20260813001153_some_migration' },
    );
  });

  it('stringifies a numeric version', () => {
    expect(mapAppliedRow({ version: 20260813001153, name: 'x' }).version).toBe('20260813001153');
    expect(typeof mapAppliedRow({ version: 20260813001153, name: 'x' }).version).toBe('string');
  });

  it('normalizes a missing or null name to null rather than undefined or an empty string', () => {
    expect(mapAppliedRow({ version: '20260813001153', name: null })).toEqual({
      version: '20260813001153',
      name: null,
    });
    expect(mapAppliedRow({ version: '20260813001153' })).toEqual({
      version: '20260813001153',
      name: null,
    });
  });
});
