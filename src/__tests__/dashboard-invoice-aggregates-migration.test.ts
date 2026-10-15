import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Issue #215 slice B. Structural assertions over the migration file; no network. */

const migrationsDir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
const MIGRATION_FILE = '20261015120000_dashboard_invoice_aggregates.sql';

const migration = readFileSync(path.join(migrationsDir, MIGRATION_FILE), 'utf8').replace(/\r\n/g, '\n');
const active = migration.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');

const STATUS_FN = 'public.get_dashboard_invoice_status_counts(date)';
const MONTHLY_FN = 'public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[])';

describe('dashboard invoice aggregates migration (#215)', () => {
  it('has an executable body', () => {
    expect(active.trim().length).toBeGreaterThan(0);
  });

  it('defines both functions as STABLE SECURITY INVOKER with a pinned search_path (RLS applies to the caller)', () => {
    expect(active).toContain('CREATE OR REPLACE FUNCTION public.get_dashboard_invoice_status_counts(p_today date)');
    expect(active).toContain('CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_invoice_counts(');
    expect(active.match(/SECURITY INVOKER/g)).toHaveLength(2);
    expect(active.match(/STABLE/g)).toHaveLength(2);
    expect(active.match(/SET search_path = public/g)).toHaveLength(2);
    expect(active).not.toContain('SECURITY DEFINER');
  });

  it('counts overdue strictly before p_today, per status (matches the old .lt(due_date, today))', () => {
    expect(active).toContain("COUNT(*) FILTER (WHERE status = 'unpaid' AND due_date < p_today)");
    expect(active).toContain("COUNT(*) FILTER (WHERE status = 'partially_paid' AND due_date < p_today)");
    expect(active).not.toMatch(/due_date <= p_today/);
  });

  it('returns every raw bucket the caller nets, each counting its own status', () => {
    for (const key of ['unpaid', 'paid', 'partially_paid', 'void']) {
      expect(active).toContain(`'${key}', COUNT(*) FILTER (WHERE status = '${key}')`);
    }
    expect(active).toContain("'overdue_unpaid', COUNT(*) FILTER (WHERE status = 'unpaid' AND due_date < p_today)");
    expect(active).toContain(
      "'overdue_partially_paid', COUNT(*) FILTER (WHERE status = 'partially_paid' AND due_date < p_today)"
    );
  });

  it('pairs each window start with its own end by ordinal', () => {
    expect(active).toContain('ON e.idx = m.idx');
    expect(active).not.toMatch(/e\.idx = m\.idx \+/);
  });

  it('uses inclusive month bounds on created_at (matches the old .gte/.lte pair)', () => {
    expect(active).toContain('i.created_at >= m.s AND i.created_at <= e.e');
  });

  it('returns a window row even when it has no invoices (count subquery, not a grouped inner join)', () => {
    expect(active).toContain('SELECT COUNT(*) FROM public.invoices i');
  });

  it('is read-only', () => {
    expect(active).not.toMatch(/\b(INSERT INTO|UPDATE public|DELETE FROM|ALTER TABLE|DROP |TRUNCATE)/i);
  });

  it('revokes from PUBLIC and anon and grants only authenticated and service_role, for both', () => {
    for (const fn of [STATUS_FN, MONTHLY_FN]) {
      expect(active).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
      expect(active).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon;`);
      expect(active).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated, service_role;`);
    }
  });

  it('documents a rollback in the header', () => {
    expect(migration).toContain('ROLLBACK');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.get_dashboard_invoice_status_counts(date);');
    expect(migration).toContain(
      'DROP FUNCTION IF EXISTS public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[]);'
    );
  });
});
