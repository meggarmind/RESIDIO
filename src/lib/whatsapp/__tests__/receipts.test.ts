import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { storeChatPdf } from '@/lib/whatsapp/statement-delivery';
import { getReceiptPayments, loadReceipt, storeReceiptPdf } from '@/lib/whatsapp/receipts';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@react-pdf/renderer', () => ({ renderToBuffer: vi.fn().mockResolvedValue(Buffer.from('%PDF')) }));
vi.mock('@/lib/pdf/payment-receipt', () => ({ PaymentReceiptPDF: vi.fn(() => null) }));
vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: vi.fn().mockResolvedValue({ status: 'ok', values: new Map([['estate_name', 'Palm Estate']]) }),
}));
vi.mock('@/lib/whatsapp/statement-delivery', () => ({ storeChatPdf: vi.fn() }));

type Call = { op: string; args: unknown[] };

function mockDb(result: unknown) {
  const calls: Call[] = [];
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'order', 'limit']) {
    chain[op] = vi.fn((...args: unknown[]) => {
      calls.push({ op, args });
      return chain;
    });
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: (value: unknown) => unknown) => resolve(result);
  vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => chain) } as unknown as ReturnType<typeof createAdminClient>);
  return calls;
}

beforeEach(() => {
  vi.mocked(storeChatPdf).mockReset().mockResolvedValue('https://storage.test/signed/receipt.pdf');
});

describe('getReceiptPayments', () => {
  it('reads the latest paid payments of this resident and property, newest first', async () => {
    const calls = mockDb({ data: [{ id: 'payment-1', amount: '50000.00', payment_date: '2026-10-12T11:00:00+00:00', method: 'bank_transfer', is_verified: true }], error: null });

    const rows = await getReceiptPayments('resident-1', 'house-1', 5);

    expect(rows).toEqual([{ id: 'payment-1', amount: 50000, payment_date: '2026-10-12T11:00:00+00:00', method: 'bank_transfer', is_verified: true }]);
    expect(calls).toContainEqual({ op: 'eq', args: ['resident_id', 'resident-1'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['house_id', 'house-1'] });
    expect(calls).toContainEqual({ op: 'eq', args: ['status', 'paid'] });
    expect(calls).toContainEqual({ op: 'order', args: ['payment_date', { ascending: false }] });
    expect(calls).toContainEqual({ op: 'limit', args: [5] });
  });
});

describe('loadReceipt (#816 decision 14)', () => {
  const row = {
    id: 'a1b2c3d4-0000-4000-8000-000000000000',
    amount: '50000.00',
    payment_date: '2026-10-12T11:00:00+00:00',
    method: 'bank_transfer',
    reference_number: 'GTB TRF',
    is_verified: true,
    verified_at: '2026-10-13T09:00:00+00:00',
    resident: { first_name: 'Ada', last_name: 'Example', resident_code: 'RES001' },
    house: { house_number: '12', short_name: null, street: { name: 'Palm Close' } },
  };

  it('only finds a verified, paid payment of this resident and property', async () => {
    const calls = mockDb({ data: row, error: null });

    const receipt = await loadReceipt('resident-1', 'house-1', row.id);

    expect(receipt).toEqual({
      receiptNumber: 'RCP-A1B2C3D4',
      residentName: 'Ada Example',
      residentCode: 'RES001',
      propertyLabel: '12, Palm Close',
      amount: 50000,
      paymentDate: row.payment_date,
      method: 'bank_transfer',
      reference: 'GTB TRF',
      verifiedAt: row.verified_at,
    });
    for (const [column, value] of [['id', row.id], ['resident_id', 'resident-1'], ['house_id', 'house-1'], ['status', 'paid'], ['is_verified', true]]) {
      expect(calls).toContainEqual({ op: 'eq', args: [column, value] });
    }
  });

  it('is null when nothing matches', async () => {
    mockDb({ data: null, error: null });
    expect(await loadReceipt('resident-1', 'house-1', 'payment-9')).toBeNull();
  });

  it('prefers the property short name and reads an embedded array', async () => {
    mockDb({ data: { ...row, house: [{ house_number: '12', short_name: 'Block 18A', street: [{ name: 'Palm Close' }] }] }, error: null });
    expect((await loadReceipt('resident-1', 'house-1', row.id))?.propertyLabel).toBe('Block 18A');
  });

  it('throws on a database error rather than reporting no receipt', async () => {
    mockDb({ data: null, error: { message: 'timeout' } });
    await expect(loadReceipt('resident-1', 'house-1', row.id)).rejects.toMatchObject({ message: 'timeout' });
  });
});

describe('storeReceiptPdf', () => {
  it('stores under receipts/ with the payment day as its dates, so the 12-hour purge and one retry apply', async () => {
    const url = await storeReceiptPdf(
      { residentId: 'resident-1', phoneNumber: '+2348000000000', houseId: 'house-1', inboundMessageId: 'wamid-1', replyText: 'Your PDF is attached.' },
      { receiptNumber: 'RCP-1', residentName: 'Ada', residentCode: 'R', propertyLabel: 'x', amount: 5, paymentDate: '2026-10-12T23:30:00+00:00', method: null, reference: null, verifiedAt: null }
    );

    expect(url).toBe('https://storage.test/signed/receipt.pdf');
    expect(storeChatPdf).toHaveBeenCalledWith(
      'receipts',
      // 23:30 UTC is already 13 October in Lagos.
      expect.objectContaining({ label: 'receipt', fromDate: '2026-10-13', toDate: '2026-10-13', rowCount: 1, replyText: 'Your PDF is attached.', inboundMessageId: 'wamid-1' }),
      expect.any(Function)
    );
  });
});
