import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = path.resolve(
  __dirname,
  '../../supabase/migrations/20261012200000_drop_forged_insert_policies.sql',
);

/** Statements with comments removed. */
function statements(): string[] {
  return readFileSync(file, 'utf8')
    .replace(/--[^\n]*/g, '')
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

describe('#471 migration drops exactly the three forged-insert policies', () => {
  it('consists solely of the three expected idempotent DROP POLICY statements', () => {
    expect([...statements()].sort()).toEqual(
      [
        'DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs',
        'DROP POLICY IF EXISTS "System can insert late fee log" ON public.late_fee_log',
        'DROP POLICY IF EXISTS "invoice_generation_log_insert" ON public.invoice_generation_log',
      ].sort(),
    );
  });

  it('documents a rollback that recreates each policy', () => {
    const raw = readFileSync(file, 'utf8');
    expect(raw).toMatch(/--\s+CREATE POLICY "Authenticated users can insert audit logs"/);
    expect(raw).toMatch(/--\s+CREATE POLICY invoice_generation_log_insert/);
    expect(raw).toMatch(/--\s+CREATE POLICY "System can insert late fee log"/);
  });
});
