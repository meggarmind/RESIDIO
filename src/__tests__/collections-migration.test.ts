import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Static contract for the Collections ledger migration (#1194). Reads the SQL off disk; no database. */
const sql = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/20261103090100_create_collections_ledger.sql', import.meta.url)),
  'utf8'
);
// The statements only: the header comments describe what the migration does NOT touch.
const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');

describe('collections ledger migration (#1194)', () => {
  it('never touches wallets, invoices or payment records', () => {
    for (const table of ['resident_wallets', 'wallet_transactions', 'invoices', 'payment_records']) {
      expect(statements).not.toMatch(new RegExp(`\\b${table}\\b`));
    }
  });

  it('lets a payer be a non-resident: resident_id is nullable, a name stands in for it', () => {
    expect(statements).toMatch(/resident_id UUID REFERENCES public\.residents\(id\)/);
    expect(statements).toMatch(/resident_id IS NOT NULL OR length\(btrim\(coalesce\(full_name, ''\)\)\) > 0/);
  });

  it('sets an item purchase amount to quantity x price and numbers receipts COL-YYYY-NNNNNN', () => {
    expect(statements).toContain('NEW.amount := NEW.quantity * NEW.unit_price;');
    expect(statements).toContain("format('COL-%s-%s', v_year, lpad(v_value::text, 6, '0'))");
  });

  it('enables RLS on every new table and gives collection payments no DELETE policy', () => {
    for (const table of ['collections', 'collection_payers', 'collection_payments', 'collection_notified_parties', 'collection_receipt_counters']) {
      expect(statements).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
    }
    expect(statements).not.toMatch(/ON public\.collection_payments\s+FOR (DELETE|ALL)/);
  });

  it('seeds collections.view and collections.manage for super_admin and chairman', () => {
    expect(statements).toContain("('collections.view', 'View Collections'");
    expect(statements).toContain("('collections.manage', 'Manage Collections'");
    expect(statements).toContain("WHERE r.name IN ('super_admin', 'chairman')");
  });
});
