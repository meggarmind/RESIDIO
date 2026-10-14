import { describe, expect, it } from 'vitest';
import { buildReconcileSql } from '../../scripts/reconcile-migration-version.mjs';

describe('buildReconcileSql (#305)', () => {
  it('keys the UPDATE on name and sets the authored version', () => {
    const sql = buildReconcileSql('20260907010000', 'seed_x');
    expect(sql).toContain("SET version = '20260907010000'");
    expect(sql).toContain("WHERE name = 'seed_x' AND version <> '20260907010000'");
  });

  it('refuses to collide with an existing row at the authored version', () => {
    expect(buildReconcileSql('20260907010000', 'seed_x')).toContain(
      "NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260907010000')",
    );
  });

  it('rejects malformed versions and names (no SQL injection via args)', () => {
    expect(() => buildReconcileSql('2026', 'seed_x')).toThrow(/14 digits/);
    expect(() => buildReconcileSql('20260907010000', "x'; DROP TABLE y;--")).toThrow(/snake_case/);
  });
});
