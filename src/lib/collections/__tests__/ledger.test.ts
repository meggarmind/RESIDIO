import { describe, expect, it, vi } from 'vitest';
import {
  buildCollectionPaymentsCsv,
  buildNotifiedPartyMessage,
  buildPayerReceiptMessage,
  planNotifiedPartyNotices,
  priceCollectionPayment,
  summarizeCollection,
  type CollectionPayment,
  type NotifiedParty,
} from '@/lib/collections/ledger';

const ITEM = { collection_type: 'item_purchase' as const, item_price: 2000, non_resident_price: null, target_amount: null };
const CONTRIBUTION = { collection_type: 'contribution' as const, item_price: null, non_resident_price: null, target_amount: 100000 };

describe('pricing a collection payment (#1194)', () => {
  it('an item purchase is quantity x price, whatever amount was sent', () => {
    expect(priceCollectionPayment(ITEM, { isResident: false, quantity: 2, amount: 1 })).toEqual({ quantity: 2, unitPrice: 2000, amount: 4000 });
  });

  it('a non-resident pays the non-resident price when set; a resident does not', () => {
    const priced = { ...ITEM, non_resident_price: 2500 };
    expect(priceCollectionPayment(priced, { isResident: false, quantity: 3 })).toEqual({ quantity: 3, unitPrice: 2500, amount: 7500 });
    expect(priceCollectionPayment(priced, { isResident: true, quantity: 3 })).toEqual({ quantity: 3, unitPrice: 2000, amount: 6000 });
  });

  it('keeps kobo exact', () => {
    expect(priceCollectionPayment({ ...ITEM, item_price: 0.1 }, { isResident: true, quantity: 3 })).toMatchObject({ amount: 0.3 });
  });

  it('refuses a missing or fractional quantity', () => {
    expect(priceCollectionPayment(ITEM, { isResident: true, quantity: 0 })).toEqual({ error: 'Enter a quantity of 1 or more' });
    expect(priceCollectionPayment(ITEM, { isResident: true, quantity: 1.5 })).toEqual({ error: 'Enter a quantity of 1 or more' });
  });

  it('a contribution takes the chosen amount and has no quantity', () => {
    expect(priceCollectionPayment(CONTRIBUTION, { isResident: false, quantity: 4, amount: 15000 })).toEqual({ quantity: null, unitPrice: null, amount: 15000 });
    expect(priceCollectionPayment(CONTRIBUTION, { isResident: false, amount: 0 })).toEqual({ error: 'Enter an amount greater than zero' });
  });
});

describe('collection report (#1194)', () => {
  const pay = (payer_id: string, amount: number, extra: Partial<CollectionPayment> = {}) =>
    ({ payer_id, amount, quantity: null, given_at: null, reversed_at: null, ...extra });

  it('a contribution: total, payers once each, percent of target, reversed payments left out', () => {
    expect(summarizeCollection(CONTRIBUTION, [pay('a', 30000), pay('a', 10000), pay('b', 5000), pay('c', 50000, { reversed_at: '2026-10-26' })])).toEqual({
      total: 45000,
      paymentCount: 3,
      payerCount: 2,
      targetPercent: 45,
      itemsSold: null,
      itemsNotGiven: null,
    });
  });

  it('a contribution with no target has no percent', () => {
    expect(summarizeCollection({ ...CONTRIBUTION, target_amount: null }, [pay('a', 10)]).targetPercent).toBeNull();
  });

  it('an item purchase: items sold and items not yet given', () => {
    const summary = summarizeCollection(ITEM, [
      pay('a', 4000, { quantity: 2, given_at: '2026-10-26T10:00:00Z' }),
      pay('b', 6000, { quantity: 3 }),
      pay('c', 2000, { quantity: 1, reversed_at: '2026-10-26' }),
    ]);
    expect(summary).toMatchObject({ total: 10000, itemsSold: 5, itemsNotGiven: 3, targetPercent: null });
  });
});

const FACTS = {
  payerName: 'Mr B',
  collectionName: 'Estate Constitution Pocket Book',
  collectionType: 'item_purchase' as const,
  quantity: 2,
  amount: 4000,
  paymentDate: '2026-10-26',
  receiptNumber: 'COL-2026-000001',
  reference: 'TRF123',
};

describe('collection messages (#1194)', () => {
  it('the notified party message has payer name, item, quantity, amount, date, receipt and reference', () => {
    const { subject, body } = buildNotifiedPartyMessage(FACTS);
    expect(subject).toBe('Payment recorded: Estate Constitution Pocket Book (COL-2026-000001)');
    for (const part of ['Payer: Mr B', 'Item: Estate Constitution Pocket Book', 'Quantity: 2', '4,000', 'Date: 26 Oct 2026', 'Receipt number: COL-2026-000001', 'Reference: TRF123']) {
      expect(body).toContain(part);
    }
  });

  it('the receipt names the quantity and date with the month as a word', () => {
    expect(buildPayerReceiptMessage(FACTS).body).toContain('for 2 x Estate Constitution Pocket Book on 26 Oct 2026');
    expect(buildPayerReceiptMessage({ ...FACTS, quantity: null, reference: null }).body).not.toContain('Reference');
  });
});

describe('notified party routing (#1194)', () => {
  const party = (extra: Partial<NotifiedParty>): NotifiedParty => ({
    id: 'p1', collection_id: 'c1', collection_payment_id: null, name: 'Fleet manager',
    email: null, sms_phone: null, whatsapp_phone: null, channels: [], ...extra,
  });

  it('no party, no message', async () => {
    await expect(planNotifiedPartyNotices([], vi.fn(), false)).resolves.toEqual([]);
  });

  it('sends email, sends WhatsApp only to an opted-in number, and skips SMS', async () => {
    const optedIn = vi.fn(async (phone: string) => (phone === '0803' ? 'res-9' : null));
    const plan = await planNotifiedPartyNotices(
      [
        party({ id: 'p1', email: 'a@x.ng', whatsapp_phone: '0803', sms_phone: '0803', channels: ['email', 'whatsapp', 'sms'] }),
        party({ id: 'p2', name: 'Supervisor', whatsapp_phone: '0809', channels: ['whatsapp'] }),
      ],
      optedIn,
      false
    );
    expect(plan).toEqual([
      { kind: 'send', partyId: 'p1', channel: 'email', email: 'a@x.ng' },
      { kind: 'send', partyId: 'p1', channel: 'whatsapp', phone: '0803', residentId: 'res-9' },
      { kind: 'skip', partyId: 'p1', partyName: 'Fleet manager', channel: 'sms', reason: 'SMS is not available' },
      { kind: 'skip', partyId: 'p2', partyName: 'Supervisor', channel: 'whatsapp', reason: 'the WhatsApp number has not opted in' },
    ]);
  });
});

describe('payment list export (#1194)', () => {
  it('one row per payment, with payer type and status, quoting commas', () => {
    const csv = buildCollectionPaymentsCsv([
      {
        id: '1', collection_id: 'c', payer_id: 'p', house_id: null, quantity: 2, unit_price: 2000, amount: 4000,
        payment_date: '2026-10-26', method: 'cash', reference: 'A, B', receipt_number: 'COL-2026-000001',
        item_reference: null, notes: null, given_at: null, reversed_at: null, reversal_reason: null, created_at: '',
        payer: { id: 'p', resident_id: null, full_name: 'Mr B', phone: '0803', email: 'b@x.ng', resident: null },
        house: null,
      },
    ]);
    const [header, row] = csv.split('\n');
    expect(header).toContain('Receipt number,Date,Payer,Payer type');
    expect(row).toBe('COL-2026-000001,26 Oct 2026,Mr B,Non-resident,,2,2000,4000.00,Cash,"A, B",,,Received');
  });
});
