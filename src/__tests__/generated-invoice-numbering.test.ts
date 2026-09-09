import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  fileURLToPath(new URL('../../supabase/migrations/20260909010000_generated_invoice_short_name_numbers.sql', import.meta.url)),
  'utf8'
);

const functionBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.create_generated_invoice'),
  migration.indexOf('REVOKE ALL ON FUNCTION public.create_generated_invoice')
);

describe('generated invoice numbering migration', () => {
  it('uses house short_name and period for new generated invoice numbers', () => {
    expect(functionBody).toContain('v_house_short_name TEXT');
    expect(functionBody).toContain("FROM public.houses");
    expect(functionBody).toContain("WHERE id = v_candidate.house_id");
    expect(functionBody).toContain("'INV-%s-%s-%s'");
    expect(functionBody).toContain('v_house_short_name');
    expect(functionBody).toContain("to_char(v_candidate.period_start, 'YYYY')");
    expect(functionBody).toContain("to_char(v_candidate.period_start, 'MM')");
  });

  it('falls back to the existing YYYYMM house UUID form when short_name is missing', () => {
    expect(functionBody).toContain('ELSE format(');
    expect(functionBody).toContain("'INV-%s-%s'");
    expect(functionBody).toContain("to_char(v_candidate.period_start, 'YYYYMM')");
    expect(functionBody).toContain("upper(substr(replace(v_candidate.house_id::text, '-', ''), 1, 8))");
  });

  it('keeps the existing generated-invoice safety contract', () => {
    expect(functionBody).toContain("public.has_permission('billing.create_invoice')");
    expect(functionBody).toContain('FOR UPDATE');
    expect(functionBody).toContain('jsonb_array_length(v_candidate.invoice_items) = 0');
    expect(functionBody).toContain('v_item_total <> v_candidate.amount_due');
    expect(functionBody).toContain('ON CONFLICT (resident_id, house_id, billing_profile_version_id, period_start, period_end)');
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) FROM anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) TO authenticated, service_role');
  });
});
