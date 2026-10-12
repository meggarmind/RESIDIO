import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '../..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');
const sql = read('supabase/migrations/20261012200100_late_fee_waivers_maker_checker.sql')
  .replace(/--[^\n]*/g, '')
  .replace(/\s+/g, ' ');

describe('#473 late_fee_waivers migration', () => {
  it('drops the FOR ALL policy and does not recreate it', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS "Admins can manage late fee waivers"');
    expect(sql).not.toMatch(/CREATE POLICY "Admins can manage late fee waivers"/);
    expect(sql).not.toMatch(/FOR ALL/);
  });

  it('UPDATE policy requires the approve permission and bars self-approval in WITH CHECK', () => {
    const m = sql.match(/CREATE POLICY "Approvers can decide late fee waivers".*?FOR UPDATE.*?WITH CHECK \((.*?)\); /);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("has_permission('billing.approve_late_fee_waiver')");
    expect(m![1]).toContain("status <> 'approved' OR requested_by <> auth.uid()");
  });

  it('INSERT policy needs the request permission, pending status and own requested_by', () => {
    const m = sql.match(/FOR INSERT TO authenticated WITH CHECK \((.*?)\); /);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("has_permission('billing.request_late_fee_waiver')");
    expect(m![1]).toContain("status = 'pending'");
    expect(m![1]).toContain('requested_by = auth.uid()');
  });

  it('makes requested_by immutable', () => {
    expect(sql).toContain('NEW.requested_by IS DISTINCT FROM OLD.requested_by');
    expect(sql).toMatch(/CREATE TRIGGER late_fee_waivers_requested_by_immutable BEFORE UPDATE/);
  });
});

describe('#473 import approve/reject permissions', () => {
  const src = read('src/actions/imports/process-import.ts');
  const body = (fn: string) => {
    const i = src.indexOf(`export async function ${fn}`);
    return src.slice(i, i + 400);
  };
  it('approveImport requires imports.approve', () => {
    expect(body('approveImport')).toContain('PERMISSIONS.IMPORTS_APPROVE');
  });
  it('rejectImport requires imports.reject', () => {
    expect(body('rejectImport')).toContain('PERMISSIONS.IMPORTS_REJECT');
  });
});
