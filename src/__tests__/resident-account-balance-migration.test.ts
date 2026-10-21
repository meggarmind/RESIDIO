import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static checks on the shared account balance migration (#863). Only the migration text is
 * pinned; nothing here connects to a database. The header's VERIFY query checks the function
 * against the old computations once it is applied.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const sql = readFileSync(path.join(root, 'supabase/migrations/20261022140000_resident_account_balance.sql'), 'utf8')
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .replace(/\s+/g, ' ')
  .trim();

const body = sql.slice(sql.indexOf('AS $$'), sql.indexOf('$$;'));
const between = (start: string, end: string) => {
  const from = body.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  return body.slice(from, body.indexOf(end, from));
};

describe('resident_account_balance migration (static)', () => {
  it('never reads amount_paid: the balance is a roll-forward, not an allocation sum', () => {
    expect(body).not.toContain('amount_paid');
  });

  it('counts non-void invoices by period_start, falling back to created_at in Lagos (decision 6)', () => {
    const invoices = between("SELECT 'invoice'", 'UNION ALL');
    expect(body).toContain("coalesce(i.period_start, (i.created_at AT TIME ZONE 'Africa/Lagos')::date) AS on_date");
    expect(invoices).toContain("i.status <> 'void'");
    expect(invoices).toContain('(p_house_id IS NULL OR i.house_id = p_house_id)');
  });

  it('counts only verified paid payments in the balance (#804 decision 18)', () => {
    const payments = between("SELECT 'payment'", 'UNION ALL');
    expect(payments).toContain("p.status = 'paid'");
    expect(payments).toContain('AND p.is_verified');
    expect(payments).toContain('-p.amount');
  });

  it('counts wallet rows only for all properties and never the mirrored ones (decision 7, #810)', () => {
    const wallet = between('FROM public.wallet_transactions w', ') SELECT');
    expect(wallet).toContain('AND p_house_id IS NULL');
    expect(wallet).toContain("(w.reference_type IS NULL OR w.reference_type NOT IN ('invoice', 'payment'))");
    expect(body).toContain("(w.created_at AT TIME ZONE 'Africa/Lagos')::date");
    expect(body).toContain("CASE WHEN w.type = 'credit' THEN -w.amount ELSE w.amount END");
  });

  it('opens on the day before the period and closes on its last day', () => {
    expect(body).toContain('coalesce(sum(e.amount) FILTER (WHERE e.on_date < p_from), 0), coalesce(sum(e.amount) FILTER (WHERE e.on_date <= p_to), 0)');
    expect(body).toContain("coalesce(-sum(e.amount) FILTER (WHERE e.kind = 'payment' AND e.on_date BETWEEN p_from AND p_to), 0)");
  });

  it('reports unverified paid or pending payments up to the period end as awaiting verification', () => {
    const awaiting = between('(SELECT coalesce(sum(u.amount), 0)', 'FROM entries e');
    expect(awaiting).toContain("u.status IN ('paid', 'pending')");
    expect(awaiting).toContain('AND NOT u.is_verified');
    expect(awaiting).toContain('AND u.payment_date <= p_to');
    expect(awaiting).toContain('(p_house_id IS NULL OR u.house_id = p_house_id)');
  });

  it("runs with the caller's RLS and is not callable anonymously", () => {
    expect(sql).toContain("LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''");
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.resident_account_balance(uuid, uuid, date, date) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.resident_account_balance(uuid, uuid, date, date) TO authenticated, service_role;');
  });

  it('seeds the resident setting off without overwriting a saved value', () => {
    expect(sql).toMatch(/INSERT INTO public\.system_settings \(key, value, description, category\) VALUES \( 'balance_roll_forward_resident_enabled', 'false'::jsonb, .*\) ON CONFLICT \(key\) DO NOTHING;/);
  });
});
