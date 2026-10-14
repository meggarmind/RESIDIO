import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Issue #63 slice 1. anon loses EXECUTE on three SECURITY DEFINER functions and
 * three duplicate indexes are dropped. Structural assertions over the migration
 * file; no network.
 */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MIGRATION_FILE = '20261014160000_revoke_anon_execute_and_drop_duplicate_indexes.sql';

const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(
  /\r\n/g,
  '\n'
);
const activeSql = migration.match(/^BEGIN;[\s\S]*?^COMMIT;/m)?.[0] ?? '';
/** Executable statements only: comments stripped, whitespace collapsed. */
const active = activeSql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
const statements = active
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s && s !== 'BEGIN' && s !== 'COMMIT');

/** Rollback block: the comment header between "-- ROLLBACK" and the executable BEGIN. */
const rollback = migration
  .slice(migration.indexOf('-- ROLLBACK'), migration.indexOf('\nBEGIN;'))
  .replace(/^--\s?/gm, '')
  .replace(/\s+/g, ' ');

const CREDIT = 'public.adjust_wallet_credit(uuid, numeric, text, uuid, text)';
const DEBIT = 'public.adjust_wallet_debit(uuid, numeric, text, uuid, text)';
const TRIGGER_FN = 'public.assert_active_super_admin_exists()';

const DROPPED = [
  'idx_read_receipts_announcement',
  'idx_audit_logs_entity_type_created',
  'idx_generated_reports_created',
];
const KEPT = [
  'idx_announcement_read_receipts_announcement',
  'idx_audit_logs_entity_created',
  'idx_generated_reports_created_at',
];

describe('revoke anon EXECUTE and drop duplicate indexes (#63)', () => {
  it('has an executable body', () => {
    expect(active.length).toBeGreaterThan(0);
    expect(statements).toHaveLength(6);
  });

  it('revokes EXECUTE from PUBLIC and anon on both wallet functions', () => {
    expect(active).toContain(`REVOKE EXECUTE ON FUNCTION ${CREDIT} FROM PUBLIC, anon;`);
    expect(active).toContain(`REVOKE EXECUTE ON FUNCTION ${DEBIT} FROM PUBLIC, anon;`);
  });

  it('does not revoke authenticated on the wallet functions', () => {
    for (const s of statements.filter((x) => /adjust_wallet_/.test(x))) {
      expect(s).not.toMatch(/\bauthenticated\b/);
    }
  });

  it('revokes EXECUTE from PUBLIC, anon and authenticated on the trigger function', () => {
    expect(active).toContain(
      `REVOKE EXECUTE ON FUNCTION ${TRIGGER_FN} FROM PUBLIC, anon, authenticated;`
    );
  });

  it('never revokes from service_role or postgres', () => {
    expect(active).not.toMatch(/service_role/);
    expect(active).not.toMatch(/\bpostgres\b/);
  });

  it('drops exactly the three duplicate indexes, idempotently', () => {
    const drops = statements.filter((s) => /^DROP\b/i.test(s));
    expect(drops).toEqual(DROPPED.map((i) => `DROP INDEX IF EXISTS public.${i}`));
  });

  it('never names a kept index in a statement', () => {
    for (const k of KEPT) {
      // Word-boundary match: idx_generated_reports_created must not match ..._created_at.
      expect(active).not.toMatch(new RegExp(`\\b${k}\\b`));
    }
  });

  it('touches nothing else: only REVOKE EXECUTE ON FUNCTION and DROP INDEX', () => {
    for (const s of statements) {
      expect(s).toMatch(/^(REVOKE EXECUTE ON FUNCTION public\.\w+\([^)]*\) FROM |DROP INDEX IF EXISTS public\.\w+$)/);
    }
    expect(active).not.toMatch(/\b(GRANT|ALTER|CREATE|TABLE|TRUNCATE|DELETE|UPDATE|INSERT)\b/);
    expect(active).not.toMatch(/\bALL FUNCTIONS\b/i);
  });

  it('rollback restores the exact prior ACLs', () => {
    expect(rollback).toContain(`GRANT EXECUTE ON FUNCTION ${CREDIT} TO anon;`);
    expect(rollback).toContain(`GRANT EXECUTE ON FUNCTION ${DEBIT} TO anon;`);
    expect(rollback).toContain(`GRANT EXECUTE ON FUNCTION ${TRIGGER_FN} TO PUBLIC;`);
    expect(rollback).toContain(`GRANT EXECUTE ON FUNCTION ${TRIGGER_FN} TO anon;`);
    expect(rollback).toContain(`GRANT EXECUTE ON FUNCTION ${TRIGGER_FN} TO authenticated;`);
    // Wallet functions never had a PUBLIC grant and authenticated was never revoked.
    expect(rollback).not.toContain(`${CREDIT} TO PUBLIC`);
    expect(rollback).not.toContain(`${DEBIT} TO PUBLIC`);
    expect(rollback).not.toContain(`${CREDIT} TO authenticated`);
    expect(rollback).not.toContain(`${DEBIT} TO authenticated`);
    expect(rollback).not.toMatch(/GRANT ALL/i);
  });

  it('rollback recreates the exact index definitions', () => {
    expect(rollback).toContain(
      'CREATE INDEX IF NOT EXISTS idx_read_receipts_announcement ON public.announcement_read_receipts USING btree (announcement_id);'
    );
    expect(rollback).toContain(
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_created ON public.audit_logs USING btree (entity_type, created_at DESC);'
    );
    expect(rollback).toContain(
      'CREATE INDEX IF NOT EXISTS idx_generated_reports_created ON public.generated_reports USING btree (created_at DESC);'
    );
  });
});
