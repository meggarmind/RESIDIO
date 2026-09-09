import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../supabase/migrations/20260908010000_atomic_manual_wallet_adjustments.sql', import.meta.url),
  'utf8',
);

function functionBody(name: string) {
  const match = migration.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`));
  expect(match, `${name} must exist`).not.toBeNull();
  return match![0];
}

function uncommented(sql: string) {
  return sql.replace(/--.*$/gm, '');
}

function statementIndex(sql: string, pattern: RegExp) {
  const match = pattern.exec(uncommented(sql));
  return match?.index ?? -1;
}

describe('atomic manual wallet adjustment migration', () => {
  it.each(['adjust_wallet_credit', 'adjust_wallet_debit'])('%s validates, authorizes, locks, updates, and writes its ledger atomically', (name) => {
    const body = functionBody(name);
    const permission = statementIndex(body, /public\.has_permission\('billing\.manage_wallets'\)/);
    const insert = statementIndex(body, /INSERT INTO public\.resident_wallets/);
    const lock = statementIndex(body, /FOR UPDATE;/);
    const update = statementIndex(body, /UPDATE public\.resident_wallets/);
    const ledger = statementIndex(body, /INSERT INTO public\.wallet_transactions/);

    expect(body).toContain("p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity')");
    expect(body).toContain('p_amount <= 0');
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = public, auth, extensions, pg_temp');
    expect(permission).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(permission);
    expect(lock).toBeGreaterThan(insert);
    expect(update).toBeGreaterThan(lock);
    expect(ledger).toBeGreaterThan(update);
  });

  it('serializes debit before checking funds so concurrent debits cannot overdraw', () => {
    const body = functionBody('adjust_wallet_debit');
    const lock = statementIndex(body, /FOR UPDATE;/);
    const fundsCheck = statementIndex(body, /IF v_wallet\.balance < p_amount THEN/);
    const update = statementIndex(body, /UPDATE public\.resident_wallets/);

    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(fundsCheck);
    expect(fundsCheck).toBeLessThan(update);
    expect(body).toContain("RAISE EXCEPTION 'Insufficient wallet balance'");
    expect(body).toContain('v_new_balance := v_wallet.balance - p_amount;');
  });

  it('relies on function transaction rollback when ledger insertion fails', () => {
    for (const name of ['adjust_wallet_credit', 'adjust_wallet_debit']) {
      const body = functionBody(name);
      expect(uncommented(body)).toMatch(/UPDATE public\.resident_wallets[\s\S]*INSERT INTO public\.wallet_transactions/);
      expect(body).not.toContain('COMMIT;');
      expect(body).not.toContain('ROLLBACK;');
    }
  });

  it('does not change RLS and requires billing.manage_wallets before direct RPC mutation', () => {
    expect(migration).not.toMatch(/CREATE POLICY|DROP POLICY|ALTER TABLE .*ROW LEVEL SECURITY/);
    expect(migration).toContain("IF NOT (public.has_permission('billing.manage_wallets') OR auth.role() = 'service_role') THEN");
    expect(migration).toContain("RAISE EXCEPTION 'Not authorized to adjust wallets'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT) FROM PUBLIC;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT) FROM PUBLIC;');
    expect(migration).toContain('TO authenticated, service_role;');
  });
});
