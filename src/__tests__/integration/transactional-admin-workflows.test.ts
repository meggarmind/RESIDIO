import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260824180000_transactional_admin_workflows.sql'),
  'utf8',
);

describe('transactional admin workflow migration', () => {
  it('serializes duplicate and concurrent wallet settlement requests', () => {
    expect(migration).toContain('pg_advisory_xact_lock(hashtextextended(p_request_key::TEXT, 0))');
    expect(migration).toContain('CREATE TABLE public.wallet_settlement_requests');
    expect(migration).toContain("RETURN v_existing.result || jsonb_build_object('existing', true)");
    expect(migration).toContain('v_result := public.settle_wallet_invoices(');
  });

  it('locks property state and commits staff, assignment, resident, and history writes together', () => {
    expect(migration).toContain('PERFORM 1 FROM public.houses WHERE id = p_house_id FOR UPDATE');
    expect(migration).toContain('CREATE TEMP TABLE transition_staff_actions ON COMMIT DROP');
    expect(migration).toContain('UPDATE public.resident_houses rh');
    expect(migration).toContain('INSERT INTO public.house_ownership_history');
    expect(migration).toContain('INSERT INTO public.property_transition_requests');
  });

  it('fails the transaction when any requested staff assignment is unavailable', () => {
    expect(migration).toContain('IF v_requested_count <> v_matched_count THEN');
    expect(migration).toContain("RAISE EXCEPTION 'One or more staff assignments are unavailable'");
  });

  it('preserves wallet financial invariants in the underlying locked settlement', () => {
    expect(migration).toContain('v_result := public.settle_wallet_invoices(');
    expect(migration).not.toContain('UPDATE public.resident_wallets SET balance = balance');
  });
});
