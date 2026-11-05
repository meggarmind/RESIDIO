import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
  tables: {} as Record<string, { data?: unknown; error: unknown; count?: number | null }>,
  calls: [] as Array<[string, string, unknown[]]>,
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

import { getWriteOffCandidates, undoWriteOff, writeOffInvoices } from '@/actions/billing/write-off-invoices';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const residentId = '11111111-1111-4111-8111-111111111111';
const billA = '22222222-2222-4222-8222-222222222222';
const billB = '33333333-3333-4333-8333-333333333333';
const batchId = '44444444-4444-4444-8444-444444444444';
const actorId = '55555555-5555-4555-8555-555555555555';

/** A query builder that records each call and resolves to the table's configured result. */
function from(table: string) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'order']) {
    builder[method] = (...args: unknown[]) => {
      mocks.calls.push([table, method, args]);
      return builder;
    };
  }
  builder.maybeSingle = async () => mocks.tables[table];
  builder.then = (resolve: (value: unknown) => unknown) => resolve(mocks.tables[table]);
  return builder;
}

const input = { residentId, invoiceIds: [billA, billB], reason: 'exco_settlement' as const, note: '  Exco settlement 4 Nov 2026  ' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls.length = 0;
  mocks.tables = {
    invoices: { data: null, error: null, count: 2 },
    residents: { data: { first_name: 'Shakiru', last_name: 'Alhaji' }, error: null },
  };
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: actorId });
  mocks.createServerSupabaseClient.mockResolvedValue({ rpc: mocks.rpc, from });
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === 'write_off_invoices') {
      return { data: { success: true, batch_id: batchId, count: 2, total: '8000', resident_id: residentId, invoice_ids: [billA, billB] }, error: null };
    }
    return { data: { success: true, batch_id: batchId, count: 2, total: 8000, resident_id: residentId, invoice_ids: [billA, billB] }, error: null };
  });
});

describe('writeOffInvoices (#1460)', () => {
  it('checks the write-off permission first and refuses without it, calling nothing else', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    const result = await writeOffInvoices(input);
    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('requires a note of 5 characters, a known reason and at least one bill', async () => {
    expect((await writeOffInvoices({ ...input, note: ' abc ' })).error).toMatch(/at least 5 characters/);
    expect((await writeOffInvoices({ ...input, reason: 'goodwill' as never })).success).toBe(false);
    expect((await writeOffInvoices({ ...input, invoiceIds: [] })).error).toMatch(/at least one bill/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses bills that are not all this resident\'s', async () => {
    mocks.tables.invoices = { data: null, error: null, count: 1 };
    expect((await writeOffInvoices(input)).error).toMatch(/belong to this resident/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('calls the RPC with the trimmed note, audits the batch and revalidates', async () => {
    const result = await writeOffInvoices(input);
    expect(result).toEqual({ success: true, error: null, batchId, count: 2, total: 8000 });
    expect(mocks.rpc).toHaveBeenCalledWith('write_off_invoices', {
      p_invoice_ids: [billA, billB],
      p_reason: 'exco_settlement',
      p_note: 'Exco settlement 4 Nov 2026',
      p_actor: actorId,
    });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'UPDATE',
      entityType: 'invoice_write_offs',
      entityId: batchId,
      entityDisplay: expect.stringMatching(/^Write-off of 2 bills \(.*8,000.*\) for Shakiru Alhaji$/),
      newValues: expect.objectContaining({ invoice_ids: [billA, billB], total: 8000, reason: 'exco_settlement', note: 'Exco settlement 4 Nov 2026' }),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith(`/residents/${residentId}`);
  });

  it('returns the RPC refusal and writes no audit row', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, error: 'All bills must belong to one resident' }, error: null });
    expect(await writeOffInvoices(input)).toEqual({ success: false, error: 'All bills must belong to one resident' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('undoWriteOff (#1460)', () => {
  it('needs the write-off permission', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    expect(await undoWriteOff(batchId)).toEqual({ success: false, error: 'Unauthorized' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('undoes the batch and audits it', async () => {
    expect(await undoWriteOff(batchId)).toEqual({ success: true, error: null, count: 2, total: 8000 });
    expect(mocks.rpc).toHaveBeenCalledWith('undo_invoice_write_off', { p_batch_id: batchId });
    expect(mocks.logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'invoice_write_offs', entityId: batchId }));
  });

  it('returns the RPC refusal and writes no audit row', async () => {
    mocks.rpc.mockResolvedValue({ data: { success: false, error: 'These bills have changed since the write-off, so it cannot be undone: INV-1' }, error: null });
    expect((await undoWriteOff(batchId)).error).toMatch(/changed since the write-off/);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('getWriteOffCandidates (#1460)', () => {
  it('is guarded by the write-off permission, not billing.view, and returns the reason on refusal', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Permission denied' });
    expect(await getWriteOffCandidates(residentId)).toEqual({ data: null, error: 'Permission denied' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_WRITE_OFF_INVOICES);
  });

  it('returns open bills with a balance and a house label', async () => {
    mocks.tables.invoices = {
      data: [
        { id: billA, invoice_number: 'INV-1', house_id: 'h', charge_category: 'dues', period_start: '2020-07-01', amount_due: '5000', amount_paid: '2000', status: 'partially_paid', house: { house_number: '36', short_name: null, street: { name: 'Palm Close' } } },
        { id: billB, invoice_number: 'INV-2', house_id: null, charge_category: 'dues', period_start: '2020-08-01', amount_due: 0, amount_paid: 0, status: 'unpaid', house: null },
      ],
      error: null,
    };
    const result = await getWriteOffCandidates(residentId);
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: billA, invoice_number: 'INV-1', house_id: 'h', house_label: '36, Palm Close', charge_category: 'dues', period_start: '2020-07-01', amount_due: 5000, amount_paid: 2000, status: 'partially_paid' },
    ]);
    expect(mocks.calls).toContainEqual(['invoices', 'in', ['status', ['unpaid', 'partially_paid']]]);
  });
});
