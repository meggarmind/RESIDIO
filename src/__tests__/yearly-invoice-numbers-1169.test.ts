import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1169: invoices are numbered INV-<YYYY>-<6-digit yearly counter>. The counter lives in
 * invoice_number_counters and is advanced by the internal allocate_invoice_number(), which
 * create_generated_invoice calls directly. The future-prepayment action calls the client-callable
 * wrapper next_invoice_number(), which requires billing.manage_wallets.
 */

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../supabase/migrations/${name}`, import.meta.url)), 'utf8');

const migration = read('20261102090000_yearly_invoice_numbers.sql');
const previous = read('20261025090000_generated_invoice_skip_empty_wallet.sql');

const createGeneratedInvoiceBody = (sql: string) => {
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_generated_invoice');
  const end = sql.indexOf('$function$;', start);
  if (start < 0 || end < 0) throw new Error('create_generated_invoice body not found');
  return sql.slice(start, end + '$function$;'.length);
};

const functionBody = (name: string) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  if (start < 0) throw new Error(`${name} not found`);
  return migration.slice(start, migration.indexOf('$function$;', start));
};
const allocateBody = functionBody('allocate_invoice_number');
const wrapperBody = functionBody('next_invoice_number');

const sqlCode = migration.replace(/--[^\n]*/g, '');

describe('yearly invoice number migration (static)', () => {
  it('creates the counter table with RLS on and no client access', () => {
    expect(sqlCode).toMatch(/CREATE TABLE IF NOT EXISTS public\.invoice_number_counters \(\s*year int PRIMARY KEY,\s*last_value int NOT NULL DEFAULT 0,/);
    expect(sqlCode).toContain('ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;');
    expect(sqlCode).toContain('REVOKE ALL ON TABLE public.invoice_number_counters FROM anon, authenticated;');
    expect(sqlCode).not.toMatch(/CREATE POLICY[^;]*invoice_number_counters/);
  });

  it('allocates with an ON CONFLICT upsert, never max()+1', () => {
    expect(allocateBody).toMatch(
      /INSERT INTO public\.invoice_number_counters \(year, last_value\)\s*VALUES \(v_year, 1\)\s*ON CONFLICT \(year\) DO UPDATE\s*SET last_value = invoice_number_counters\.last_value \+ 1/
    );
    expect(allocateBody).toContain('RETURNING last_value INTO v_value');
    expect(allocateBody.toLowerCase()).not.toContain('max(');
  });

  it('formats INV-<YYYY>-<6 digits> and skips numbers already used', () => {
    expect(allocateBody).toContain("format('INV-%s-%s', v_year, lpad(v_value::text, 6, '0'))");
    expect(allocateBody).toContain('LOOP');
    expect(allocateBody).toMatch(/EXIT WHEN NOT EXISTS \(\s*SELECT 1 FROM public\.invoices WHERE invoice_number = v_number/);
    expect(allocateBody).toMatch(/IF p_period_start IS NULL THEN\s*RAISE EXCEPTION/);
  });

  it('keeps the internal allocator SECURITY DEFINER and service_role only', () => {
    expect(allocateBody).toContain('SECURITY DEFINER');
    expect(allocateBody).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(sqlCode).toContain('REVOKE ALL ON FUNCTION public.allocate_invoice_number(date) FROM PUBLIC;');
    expect(sqlCode).toContain('REVOKE EXECUTE ON FUNCTION public.allocate_invoice_number(date) FROM anon, authenticated;');
    expect(sqlCode).toContain('GRANT EXECUTE ON FUNCTION public.allocate_invoice_number(date) TO service_role;');
    expect(sqlCode).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.allocate_invoice_number\(date\) TO [^;]*(authenticated|anon)/);
  });

  it('guards the client-callable wrapper with billing.manage_wallets', () => {
    expect(wrapperBody).toContain('SECURITY DEFINER');
    expect(wrapperBody).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(wrapperBody).toMatch(
      /BEGIN\s*IF NOT public\.has_permission\('billing\.manage_wallets'\) THEN\s*RAISE EXCEPTION 'Not authorised to allocate invoice numbers' USING ERRCODE = '42501';\s*END IF;\s*RETURN public\.allocate_invoice_number\(p_period_start\);\s*END;/
    );
    expect(wrapperBody).not.toContain('invoice_number_counters');
    expect(sqlCode).toContain('REVOKE ALL ON FUNCTION public.next_invoice_number(date) FROM PUBLIC;');
    expect(sqlCode).toContain('REVOKE EXECUTE ON FUNCTION public.next_invoice_number(date) FROM anon;');
    expect(sqlCode).toContain('GRANT EXECUTE ON FUNCTION public.next_invoice_number(date) TO authenticated, service_role;');
  });

  it('makes create_generated_invoice use the internal allocator and drops the 4-part format', () => {
    const body = createGeneratedInvoiceBody(migration);
    expect(body).toContain('v_invoice_number := public.allocate_invoice_number(v_candidate.period_start);');
    expect(body).not.toContain('next_invoice_number');
    expect(body).not.toContain("'INV-%s-%s-%s-%s'");
    expect(body).not.toContain("to_char(v_candidate.period_start, 'YYYYMM')");
  });

  it('leaves the rest of create_generated_invoice identical to 20261025090000', () => {
    const normalise = (sql: string) =>
      createGeneratedInvoiceBody(sql)
        .replace(/v_invoice_number\s*:=[\s\S]*?;/, '')
        .replace(/\s+/g, ' ')
        .trim();
    expect(normalise(migration)).toBe(normalise(previous));
    const grants = (sql: string) => sql.match(/^(REVOKE|GRANT)[^\n]*create_generated_invoice[^\n]*$/gm);
    expect(grants(migration)).toEqual(grants(previous));
  });

  it('carries a rollback block that drops the new objects', () => {
    const rollback = migration.slice(migration.indexOf('-- ROLLBACK:'));
    expect(rollback).toContain('20261025090000_generated_invoice_skip_empty_wallet.sql');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.next_invoice_number(date);');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.allocate_invoice_number(date);');
    expect(rollback).toContain('DROP TABLE IF EXISTS public.invoice_number_counters;');
  });
});

// ---------------------------------------------------------------------------------------------
// prepayFutureInvoices uses the RPC value as the invoice number.
// ---------------------------------------------------------------------------------------------

const prepay = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoiceInserts: [] as Array<Record<string, unknown>>,
  logAudit: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => {
  type Result = { data: unknown; error: unknown };
  const chain = (result: Result, onInsert?: (v: unknown) => void) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'update']) c[m] = vi.fn(() => c);
    c.insert = vi.fn((v: unknown) => {
      onInsert?.(v);
      return c;
    });
    c.single = vi.fn(async () => result);
    c.maybeSingle = vi.fn(async () => result);
    c.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
    return c;
  };
  let invoiceSeq = 0;
  const supabase = {
    rpc: prepay.rpc,
    from: vi.fn((table: string) => {
      switch (table) {
        case 'resident_houses':
          return chain({ data: { resident_id: 'r1', house_id: 'h1', resident_role: 'tenant' }, error: null });
        case 'houses':
          return chain({ data: { id: 'h1', house_number: '14', short_name: 'GLB-14', billing_profile_id: 'bp1', house_type_id: null }, error: null });
        case 'billing_profiles':
          return chain({
            data: {
              id: 'bp1',
              name: 'Monthly',
              is_one_time: false,
              billing_items: [{ id: 'i1', name: 'Service charge', amount: 5000, frequency: 'monthly', is_mandatory: true }],
            },
            error: null,
          });
        case 'invoices': {
          // First call is the existing-invoices lookup (awaited directly); later ones are inserts.
          const c = chain({ data: [], error: null }, (v) => prepay.invoiceInserts.push(v as Record<string, unknown>));
          c.single = vi.fn(async () => ({ data: { id: `inv-${++invoiceSeq}` }, error: null }));
          return c;
        }
        case 'payment_records':
          return chain({ data: { id: 'pay1' }, error: null });
        default:
          return chain({ data: null, error: null });
      }
    }),
  };
  return { createServerSupabaseClient: async () => supabase, createAdminClient: () => supabase };
});
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'admin-1' }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: prepay.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { prepayFutureInvoices } from '@/actions/billing/prepay-future-invoices';

const nextYear = new Date().getFullYear() + 1;
const input = {
  residentId: '11111111-1111-4111-8111-111111111111',
  houseId: '22222222-2222-4222-8222-222222222222',
  startMonth: `${nextYear}-01-01`,
  endMonth: `${nextYear}-02-01`,
  method: 'bank_transfer' as const,
};

describe('prepayFutureInvoices invoice numbers (#1169)', () => {
  beforeEach(() => {
    prepay.rpc.mockReset();
    prepay.invoiceInserts.length = 0;
    prepay.logAudit.mockClear();
  });

  it('numbers each new invoice from next_invoice_number for its month', async () => {
    let n = 0;
    prepay.rpc.mockImplementation(async (name: string) => {
      if (name === 'next_invoice_number') return { data: `INV-${nextYear}-${String(++n).padStart(6, '0')}`, error: null };
      return {
        data: { success: true, batch_id: 'b1', receipt_number: 'R1', total_allocated: 10000, allocations: [{}, {}] },
        error: null,
      };
    });

    const res = await prepayFutureInvoices(input);

    expect(res).toMatchObject({ success: true, invoicesCreated: 2 });
    const numberCalls = prepay.rpc.mock.calls.filter(([name]) => name === 'next_invoice_number');
    expect(numberCalls).toEqual([
      ['next_invoice_number', { p_period_start: `${nextYear}-01-01` }],
      ['next_invoice_number', { p_period_start: `${nextYear}-02-01` }],
    ]);
    expect(prepay.invoiceInserts.map((v) => v.invoice_number)).toEqual([`INV-${nextYear}-000001`, `INV-${nextYear}-000002`]);
    expect(prepay.logAudit).toHaveBeenCalledTimes(1);
  });

  it('stops without inserting the invoice when the number cannot be allocated', async () => {
    prepay.rpc.mockImplementation(async (name: string) =>
      name === 'next_invoice_number' ? { data: null, error: { message: 'counter unavailable' } } : { data: null, error: null }
    );

    const res = await prepayFutureInvoices(input);

    expect(res).toEqual({ success: false, error: 'counter unavailable' });
    expect(prepay.invoiceInserts).toHaveLength(0);
    expect(prepay.rpc.mock.calls.some(([name]) => name !== 'next_invoice_number')).toBe(false);
    expect(prepay.logAudit).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------
// The real migrations in PGlite: counter behaviour and create_generated_invoice output.
// ---------------------------------------------------------------------------------------------

const ACTOR = '11111111-1111-1111-1111-111111111111';
const RESIDENT_USER = '33333333-3333-3333-3333-333333333333';
let db: PGlite;
type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await db.query<Row>(sql, params)).rows[0];
const next = async (periodStart: string | null) =>
  (await one(`SELECT public.allocate_invoice_number($1::date) AS n`, [periodStart])).n as string;
const wrapper = async (periodStart: string) =>
  (await one(`SELECT public.next_invoice_number($1::date) AS n`, [periodStart])).n as string;
/** Act as the given account through PostgREST's role (transaction-local). */
const actAs = async (id: string | null) => {
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [id ? JSON.stringify({ sub: id, role: 'authenticated' }) : '']);
  await db.exec('SET LOCAL ROLE authenticated');
};

let seq = 0;
async function generateInvoice(periodStart: string, periodEnd: string): Promise<Row> {
  seq++;
  const resident = (
    await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`, [
      `N${seq}`,
      `+23411100${String(seq).padStart(5, '0')}`,
    ])
  ).id;
  const house = (
    await one(`INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $2 FROM public.streets LIMIT 1 RETURNING id`, [
      `N-${seq}`,
      `N${seq}`,
    ])
  ).id;
  const candidate = (
    await one(
      `INSERT INTO public.invoice_generation_candidates (
         run_id, resident_id, house_id, billing_profile_id, billing_profile_version_id,
         period_start, period_end, due_date, amount_due, invoice_items, wallet_allocation_requested)
       SELECT r.id, $1, $2, v.billing_profile_id, v.id, $3::date, $4::date, $3::date,
         5000, '[{"description": "Service charge", "amount": 5000}]'::jsonb, false
       FROM public.invoice_generation_runs r, public.billing_profile_versions v LIMIT 1
       RETURNING id`,
      [resident, house, periodStart, periodEnd]
    )
  ).id;
  return (await one(`SELECT public.create_generated_invoice($1, $2) AS r`, [candidate, ACTOR])).r;
}

describe('invoice number allocation in PGlite', () => {
  beforeAll(async () => {
    db = await loadSchema(laterMigrations());
    await replay(
      db,
      'fixtures',
      `
      INSERT INTO auth.users (id, email) VALUES ('${ACTOR}', 'sa@example.test'), ('${RESIDENT_USER}', 'res@example.test');
      INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
        SELECT '${ACTOR}', 'sa@example.test', 'SA', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
        ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
      INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
        SELECT '${RESIDENT_USER}', 'res@example.test', 'Res', id, 'active' FROM public.app_roles WHERE name = 'resident'
        ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
      INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
        VALUES ('billing.manage_wallets', 'Manage Wallets', 'Adjust resident wallet balances', 'billing', true)
        ON CONFLICT (name) DO NOTHING;
      INSERT INTO public.role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM public.app_roles r, public.app_permissions p
        WHERE r.name = 'super_admin' AND p.name = 'billing.manage_wallets'
        ON CONFLICT DO NOTHING;
      INSERT INTO public.streets (name) VALUES ('Number Street');
      INSERT INTO public.billing_profiles (name) VALUES ('Number Profile');
      INSERT INTO public.billing_profile_versions (billing_profile_id, effective_from)
        SELECT id, DATE '2026-01-01' FROM public.billing_profiles LIMIT 1;
      INSERT INTO public.invoice_generation_runs (status) VALUES ('draft');
      `
    );
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec('BEGIN');
    return async () => {
      await db.exec('ROLLBACK');
    };
  });

  it('counts up per billing year and restarts at 1 for a new year', async () => {
    expect(await next('2026-03-01')).toBe('INV-2026-000001');
    expect(await next('2026-12-01')).toBe('INV-2026-000002');
    expect(await next('2027-01-01')).toBe('INV-2027-000001');
    expect(await next('2026-05-01')).toBe('INV-2026-000003');
  });

  it('raises when period_start is null', async () => {
    await expect(next(null)).rejects.toThrow(/requires a period_start/);
  });

  it('create_generated_invoice issues the yearly number', async () => {
    const result = await generateInvoice('2026-11-01', '2026-11-30');
    expect(result).toMatchObject({ status: 'created' });
    const invoice = await one(`SELECT invoice_number FROM public.invoices WHERE id = $1`, [result.invoice_id]);
    expect(invoice.invoice_number).toBe('INV-2026-000001');
  });

  it('next_invoice_number allocates for a user with billing.manage_wallets', async () => {
    await actAs(ACTOR);
    expect(await wrapper('2026-03-01')).toBe('INV-2026-000001');
    expect(await wrapper('2026-04-01')).toBe('INV-2026-000002');
  });

  it('next_invoice_number refuses without billing.manage_wallets and burns no number', async () => {
    await actAs(RESIDENT_USER);
    await db.exec('SAVEPOINT refused');
    await expect(wrapper('2026-03-01')).rejects.toMatchObject({ code: '42501', message: 'Not authorised to allocate invoice numbers' });
    await db.exec('ROLLBACK TO SAVEPOINT refused; RESET ROLE');
    expect((await one(`SELECT count(*)::int AS n FROM public.invoice_number_counters`)).n).toBe(0);
  });

  it('the internal allocator is not executable by authenticated', async () => {
    await actAs(ACTOR);
    await expect(next('2026-03-01')).rejects.toThrow(/permission denied for function allocate_invoice_number/);
  });

  it('skips a number an existing invoice already holds', async () => {
    await generateInvoice('2026-11-01', '2026-11-30'); // INV-2026-000001
    await db.query(`UPDATE public.invoice_number_counters SET last_value = 0 WHERE year = 2026`);
    expect(await next('2026-03-01')).toBe('INV-2026-000002');
  });
});
