/**
 * #474: update actions must pick allowed columns explicitly and never spread
 * the caller's object into the database. Each test sends a forbidden field
 * and asserts it never reaches the mocked .update()/.insert() argument.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; op: 'update' | 'insert'; payload: unknown };
const calls: Call[] = [];
const tableResults: Record<string, unknown> = {};

function makeBuilder(table: string) {
  let op: 'select' | 'update' | 'insert' = 'select';
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['eq', 'neq', 'in', 'order', 'limit', 'select', 'is', 'gte', 'lte']) {
    builder[m] = vi.fn(chain);
  }
  builder.update = vi.fn((payload: unknown) => { op = 'update'; calls.push({ table, op, payload }); return builder; });
  builder.insert = vi.fn((payload: unknown) => { op = 'insert'; calls.push({ table, op, payload }); return builder; });
  const result = () => {
    const r = tableResults[`${table}:${op}`] ?? tableResults[table] ?? { data: null, error: null };
    return r;
  };
  builder.single = vi.fn(async () => result());
  builder.then = (resolve: (v: unknown) => unknown) => resolve(result());
  return builder;
}

const supabase = {
  from: vi.fn((table: string) => makeBuilder(table)),
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
};

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(async () => supabase),
  createAdminClient: vi.fn(async () => supabase),
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => ({ authorized: true })),
}));
vi.mock('@/lib/audit/logger', () => ({
  logAudit: vi.fn(async () => undefined),
  getChangedValues: vi.fn(() => ({ old: {}, new: {} })),
}));
vi.mock('@/lib/audit/helpers', () => ({
  getChangedValues: vi.fn(() => ({ old: {}, new: {} })),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/reports/scheduled-report-store', () => ({
  calculateNextRunDate: vi.fn(() => new Date('2030-01-01T00:00:00Z')),
}));
vi.mock('@/actions/billing/wallet', () => ({
  allocateWalletToInvoices: vi.fn(async () => ({ success: true, invoicesPaid: 0, totalAllocated: 0 })),
}));
vi.mock('@/lib/matching/duplicate-matcher', () => ({
  checkDuplicateGuardrail: vi.fn(async () => ({ isDuplicate: false })),
}));
vi.mock('@/lib/notifications/preferences', () => ({
  shouldSendToResident: vi.fn(async () => ({ shouldSend: false })),
}));
vi.mock('@/lib/whatsapp/outbound', () => ({ buildPaymentReceivedWhatsApp: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn() }));

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

const updatesTo = (table: string) => calls.filter((c) => c.table === table && c.op === 'update').map((c) => c.payload as Record<string, unknown>);
const insertsTo = (table: string) => calls.filter((c) => c.table === table && c.op === 'insert').map((c) => (Array.isArray(c.payload) ? c.payload[0] : c.payload) as Record<string, unknown>);

beforeEach(() => {
  calls.length = 0;
  for (const k of Object.keys(tableResults)) delete tableResults[k];
});

describe('updatePayment', () => {
  it('strips is_verified / verified_by / bank_row_id and never writes them', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, amount: 5 }, error: null };

    const res = await updatePayment(UUID_A, {
      amount: 100,
      notes: 'fix',
      is_verified: true,
      verified_by: UUID_C,
      bank_row_id: UUID_C,
      proof_url: 'http://evil',
    } as never);

    expect(res.success).toBe(true);
    const [payload] = updatesTo('payment_records');
    expect(payload).toEqual({ amount: 100, notes: 'fix' });
    expect(payload).not.toHaveProperty('is_verified');
    expect(payload).not.toHaveProperty('verified_by');
    expect(payload).not.toHaveProperty('bank_row_id');
    expect(payload).not.toHaveProperty('proof_url');
  });

  it('keeps every field the payment form sends (dates serialised)', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, amount: 5 }, error: null };
    tableResults['resident_houses'] = { data: [{ id: 'rh' }], error: null };
    const d = new Date('2026-01-02T00:00:00Z');

    await updatePayment(UUID_A, {
      resident_id: UUID_B, house_id: UUID_C, amount: 50, payment_date: d, status: 'paid',
      method: 'cash', reference_number: 'R1', notes: 'n', period_start: d, period_end: d,
    });

    expect(updatesTo('payment_records')[0]).toEqual({
      resident_id: UUID_B, house_id: UUID_C, amount: 50, payment_date: d.toISOString(), status: 'paid',
      method: 'cash', reference_number: 'R1', notes: 'n', period_start: d.toISOString(), period_end: d.toISOString(),
    });
  });

  it('rejects a house that does not belong to the resident', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, amount: 5 }, error: null };
    tableResults['resident_houses'] = { data: [], error: null };

    const res = await updatePayment(UUID_A, { house_id: UUID_C });
    expect(res.success).toBe(false);
    expect(updatesTo('payment_records')).toHaveLength(0);
  });

  it('leaves an unchanged house_id on a legacy row editable (no membership lookup)', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, house_id: UUID_C, amount: 5 }, error: null };
    tableResults['resident_houses'] = { data: [], error: null }; // no membership row

    const res = await updatePayment(UUID_A, { house_id: UUID_C, notes: 'x' });
    expect(res.success).toBe(true);
    expect(updatesTo('payment_records')).toHaveLength(1);
  });

  it('rejects a changed house_id without membership', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, house_id: UUID_A, amount: 5 }, error: null };
    tableResults['resident_houses'] = { data: [], error: null };

    const res = await updatePayment(UUID_A, { house_id: UUID_C });
    expect(res.success).toBe(false);
    expect(updatesTo('payment_records')).toHaveLength(0);
  });

  it('re-checks the existing house when resident_id alone changes', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    tableResults['payment_records'] = { data: { id: UUID_A, resident_id: UUID_B, house_id: UUID_C, amount: 5 }, error: null };
    tableResults['resident_houses'] = { data: [], error: null };

    const res = await updatePayment(UUID_A, { resident_id: UUID_A });
    expect(res.success).toBe(false);
    expect(updatesTo('payment_records')).toHaveLength(0);
  });

  it('rejects invalid values instead of writing them', async () => {
    const { updatePayment } = await import('@/actions/payments/update-payment');
    const res = await updatePayment(UUID_A, { amount: -5 } as never);
    expect(res.success).toBe(false);
    expect(updatesTo('payment_records')).toHaveLength(0);
  });
});

describe('createPayment', () => {
  const base = { resident_id: UUID_B, amount: 10, payment_date: new Date('2026-01-01T00:00:00Z'), status: 'paid' as const };

  it('drops client-supplied is_verified and bank_row_id', async () => {
    const { createPayment } = await import('@/actions/payments/create-payment');
    tableResults['payment_records'] = { data: { id: UUID_A }, error: null };

    const res = await createPayment({ ...base, is_verified: true, bank_row_id: UUID_C });
    expect(res.success).toBe(true);
    const row = insertsTo('payment_records')[0];
    expect(row.is_verified).toBe(false);
    expect(row.verified_at).toBeNull();
    expect(row.bank_row_id).toBeUndefined();
  });

  it('the core ignores is_verified / bank_row_id unless trustedVerification is set', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    tableResults['payment_records'] = { data: { id: UUID_A }, error: null };

    await createPaymentCore({ ...base, is_verified: true, bank_row_id: UUID_C });
    const row = insertsTo('payment_records')[0];
    expect(row.is_verified).toBe(false);
    expect(row.bank_row_id).toBeUndefined();
  });

  it('honours is_verified / bank_row_id on the trusted importer path only', async () => {
    const { createPaymentCore } = await import('@/lib/payments/create-payment');
    tableResults['payment_records'] = { data: { id: UUID_A }, error: null };

    await createPaymentCore({ ...base, is_verified: true, bank_row_id: UUID_C }, { trustedVerification: true });
    const row = insertsTo('payment_records')[0];
    expect(row.is_verified).toBe(true);
    expect(row.bank_row_id).toBe(UUID_C);
  });

  it('rejects a house that is not associated with the resident and inserts nothing', async () => {
    const { createPayment } = await import('@/actions/payments/create-payment');
    tableResults['resident_houses'] = { data: [], error: null };

    const res = await createPayment({ ...base, house_id: UUID_C });
    expect(res.error).toMatch(/not associated/);
    expect(insertsTo('payment_records')).toHaveLength(0);
  });

  it('accepts a house that belongs to the resident', async () => {
    const { createPayment } = await import('@/actions/payments/create-payment');
    tableResults['resident_houses'] = { data: [{ id: 'rh' }], error: null };
    tableResults['payment_records'] = { data: { id: UUID_A }, error: null };

    const res = await createPayment({ ...base, house_id: UUID_C });
    expect(res.success).toBe(true);
    expect(insertsTo('payment_records')[0].house_id).toBe(UUID_C);
  });
});

describe('updateSecurityContact', () => {
  it('never writes status or created_by', async () => {
    const { updateSecurityContact } = await import('@/actions/security/contacts');
    tableResults['security_contacts'] = { data: { id: UUID_A, full_name: 'Jo' }, error: null };

    const res = await updateSecurityContact({
      id: UUID_A, full_name: 'Jo Doe', status: 'revoked', created_by: UUID_C, visit_count: 99,
    } as never);

    expect(res.error).toBeNull();
    const [payload] = updatesTo('security_contacts');
    expect(payload).toEqual({ full_name: 'Jo Doe' });
  });

  it('still maps empty strings to null for optional fields', async () => {
    const { updateSecurityContact } = await import('@/actions/security/contacts');
    tableResults['security_contacts'] = { data: { id: UUID_A, full_name: 'Jo' }, error: null };

    await updateSecurityContact({ id: UUID_A, notes: '' });
    expect(updatesTo('security_contacts')[0]).toEqual({ notes: null });
  });
});

describe('updatePettyCashAccount', () => {
  it('never writes current_balance or other columns, and maps initialFloat', async () => {
    const { updatePettyCashAccount } = await import('@/actions/finance/petty-cash');
    tableResults['petty_cash_accounts'] = { data: { id: UUID_A, name: 'Main' }, error: null };

    const res = await updatePettyCashAccount(UUID_A, {
      name: 'Main', initialFloat: 500, notes: 'x', current_balance: 9999999, is_active: false,
    } as never);

    expect(res.error).toBeNull();
    expect(updatesTo('petty_cash_accounts')[0]).toEqual({ name: 'Main', initial_float: 500, notes: 'x' });
  });
});

describe('updateVehicle', () => {
  it('strips contact_id and unknown keys, and does not reset defaults', async () => {
    const { updateVehicle } = await import('@/actions/security/vehicles');
    tableResults['visitor_vehicles'] = { data: { id: UUID_A, contact_id: UUID_B }, error: null };

    await updateVehicle({ id: UUID_A, color: 'red', contact_id: UUID_C, visit_count: 5 } as never);
    expect(updatesTo('visitor_vehicles')[0]).toEqual({ color: 'red' });
  });
});

describe('createProject', () => {
  const valid = { name: 'Road', total_budget: 100, status: 'planning' as const };

  it('rejects unknown keys such as current_progress', async () => {
    const { createProject } = await import('@/actions/projects/create-project');
    await expect(createProject({ ...valid, current_progress: 100 } as never)).rejects.toThrow();
    expect(insertsTo('projects')).toHaveLength(0);
  });

  it('inserts only the allowed columns', async () => {
    const { createProject } = await import('@/actions/projects/create-project');
    tableResults['projects'] = { data: { id: UUID_A }, error: null };
    await createProject({ ...valid, description: 'd' });
    expect(insertsTo('projects')[0]).toEqual({
      name: 'Road', description: 'd', total_budget: 100, status: 'planning', start_date: undefined, end_date: undefined,
    });
  });
});

describe('updateReportSchedule', () => {
  it('rejects forbidden columns (next_run_at, last_run_at, created_by)', async () => {
    const { updateReportSchedule } = await import('@/actions/reports/report-schedules');
    tableResults['report_schedules'] = { data: { id: UUID_A, name: 's', frequency: 'daily', next_run_at: 'x' }, error: null };

    const res = await updateReportSchedule(UUID_A, { name: 'n', last_run_at: '2000-01-01', created_by: UUID_C } as never);
    expect(res.data).toBeNull();
    expect(res.error).toBeTruthy();
    expect(updatesTo('report_schedules')).toHaveLength(0);
  });

  it('writes allowed fields plus a recomputed next_run_at', async () => {
    const { updateReportSchedule } = await import('@/actions/reports/report-schedules');
    tableResults['report_schedules'] = { data: { id: UUID_A, name: 's', frequency: 'daily', next_run_at: 'x' }, error: null };

    await updateReportSchedule(UUID_A, { name: 'n', is_active: false });
    expect(updatesTo('report_schedules')[0]).toEqual({ name: 'n', is_active: false, next_run_at: 'x' });
  });
});

describe('updateDocumentCategory', () => {
  it('rejects unknown columns', async () => {
    const { updateDocumentCategory } = await import('@/actions/documents/categories');
    const res = await updateDocumentCategory(UUID_A, { name: 'n', id: UUID_C, created_at: 'x' } as never);
    expect(res.data).toBeNull();
    expect(updatesTo('document_categories')).toHaveLength(0);
  });

  it('writes the allowed columns', async () => {
    const { updateDocumentCategory } = await import('@/actions/documents/categories');
    tableResults['document_categories'] = { data: { id: UUID_A, name: 'n' }, error: null };
    await updateDocumentCategory(UUID_A, { name: 'n', is_active: false });
    expect(updatesTo('document_categories')[0]).toEqual({ name: 'n', is_active: false });
  });
});
