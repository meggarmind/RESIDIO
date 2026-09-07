import { describe, expect, it } from 'vitest';
import { compareMigrations, isClean, versionOf } from '../../scripts/migration-drift.mjs';

/**
 * Unit tests for the migration-drift comparison logic (#283). Fixture-driven, no
 * filesystem or network access — `compareMigrations` is pure, taking a
 * `Map<version, filename[]>` (the shape `readLocalMigrations` returns) and an array
 * of applied version strings (the shape the Management API query returns).
 */

function localFixture(entries: Record<string, string[]>): Map<string, string[]> {
  return new Map(Object.entries(entries));
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

describe('compareMigrations', () => {
  it('reports no drift when local and applied match exactly', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
      '20251207000000': ['20251207000000_fix_rls_recursion.sql'],
    });
    const applied = ['20251206223732', '20251207000000'];

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
    const applied = ['20251206223732', '20260815055719'];

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
    const applied = ['20251206223732'];

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
    const applied = ['20251206223732', '20260101000000', '20260815055719'];

    const result = compareMigrations(local, applied);

    expect(result.appliedNotOnDisk).toEqual(['20260101000000', '20260815055719']);
    expect(result.fileNotApplied).toEqual(['20260906000000']);
    expect(isClean(result)).toBe(false);
  });

  it('names the specific versions that diverge, not just a count', () => {
    const local = localFixture({
      '20251206223732': ['20251206223732_create_profiles_table.sql'],
    });
    const applied = ['20251206223732', '20260101000000'];

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
    const applied = ['20260811130000'];

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
    const applied: string[] = [];

    const result = compareMigrations(local, applied);

    expect(result.fileNotApplied).toEqual(['20260811130000']);
    expect(result.duplicateVersions).toHaveLength(1);
    expect(isClean(result)).toBe(false);
  });
});
