import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { addToQueue } from '@/lib/notifications/queue';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { queueCollectionPaymentNotices } from '@/lib/collections/notify';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn(), PRIORITY: { NORMAL: 5 } }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn() }));
vi.mock('@/lib/whatsapp/resident-send', () => ({ RESIDENT_SEND_METADATA_KEY: 'whatsapp_resident_send' }));

type Result = { data?: unknown; error?: unknown };

function query(result: Result) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'is', 'or', 'order', 'limit']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function client(tables: Record<string, Result[]>) {
  const from = vi.fn((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    return query(next);
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

const PAYER_PHONE = '08031234567';
const PAYER_EMAIL = 'mr.b@example.com';

const payment = (collectionType: 'item_purchase' | 'contribution', payer: Record<string, unknown> = {}) => ({
  data: {
    id: 'pay-1', collection_id: 'col-1', quantity: collectionType === 'item_purchase' ? 2 : null, amount: 4000,
    payment_date: '2026-10-26', reference: 'TRF123', receipt_number: 'COL-2026-000001',
    collection: { name: 'Vehicle Sticker 2027', collection_type: collectionType },
    payer: { id: 'payer-1', resident_id: null, full_name: 'Mr B', phone: PAYER_PHONE, email: PAYER_EMAIL, resident: null, ...payer },
  },
  error: null,
});

const party = (id: string, extra: Record<string, unknown>) => ({
  id, collection_id: null, collection_payment_id: null, name: id, email: null, sms_phone: null, whatsapp_phone: null, channels: [], ...extra,
});

const queued = () => vi.mocked(addToQueue).mock.calls.map(([input]) => input);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addToQueue).mockResolvedValue({ success: true, queueId: 'q' });
  vi.mocked(isWhatsAppOptedIn).mockResolvedValue(false);
});

describe('collection payment notices (#1194)', () => {
  it('a party on the collection and a party on the payment each get the message, without the payer contacts', async () => {
    client({
      collection_payments: [payment('item_purchase')],
      // Payer phone: not an opted-in number.
      whatsapp_optins: [{ data: [], error: null }],
      collection_notified_parties: [{
        data: [
          party('Security supervisor', { collection_id: 'col-1', email: 'sup@estate.ng', channels: ['email'] }),
          party('Fleet manager', { collection_payment_id: 'pay-1', email: 'fleet@co.ng', channels: ['email'] }),
        ],
        error: null,
      }],
    });

    const result = await queueCollectionPaymentNotices('pay-1');

    const toParties = queued().filter((input) => input.recipient_email !== PAYER_EMAIL);
    expect(toParties.map((input) => input.recipient_email)).toEqual(['sup@estate.ng', 'fleet@co.ng']);
    for (const input of toParties) {
      expect(input.recipient_id).toBeNull();
      expect(input.metadata).toMatchObject({ collection_notice: expect.any(String) });
      expect(input.body).toContain('Payer: Mr B');
      expect(input.body).not.toContain(PAYER_PHONE);
      expect(input.body).not.toContain(PAYER_EMAIL);
    }
    expect(result).toEqual({ queued: 3, skipped: [] });
  });

  it('with no notified party only the payer receipt is queued', async () => {
    client({
      collection_payments: [payment('item_purchase')],
      whatsapp_optins: [{ data: [], error: null }],
      collection_notified_parties: [{ data: [], error: null }],
    });
    const result = await queueCollectionPaymentNotices('pay-1');
    expect(queued()).toEqual([expect.objectContaining({ channel: 'email', recipient_email: PAYER_EMAIL, subject: 'Receipt COL-2026-000001: Vehicle Sticker 2027' })]);
    expect(result).toEqual({ queued: 1, skipped: [] });
  });

  it('a contribution never looks for notified parties', async () => {
    const from = client({ collection_payments: [payment('contribution', { phone: null })] });
    await queueCollectionPaymentNotices('pay-1');
    expect(from.mock.calls.map(([table]) => table)).toEqual(['collection_payments']);
  });

  it('WhatsApp goes to an opted-in party number as a resident message, and a number not opted in is reported', async () => {
    client({
      collection_payments: [payment('item_purchase', { phone: null, email: null })],
      whatsapp_optins: [{ data: [{ resident_id: 'res-7' }], error: null }, { data: [], error: null }],
      collection_notified_parties: [{
        data: [
          party('Supervisor', { collection_id: 'col-1', whatsapp_phone: '08030000001', channels: ['whatsapp'] }),
          party('Fleet manager', { collection_payment_id: 'pay-1', whatsapp_phone: '08030000002', sms_phone: '08030000002', channels: ['whatsapp', 'sms'] }),
        ],
        error: null,
      }],
    });

    const result = await queueCollectionPaymentNotices('pay-1');

    expect(queued()).toEqual([
      expect.objectContaining({
        channel: 'whatsapp',
        recipient_id: 'res-7',
        recipient_phone: '08030000001',
        metadata: expect.objectContaining({ whatsapp_resident_send: { seed: 'collection-notice:pay-1:Supervisor:whatsapp' } }),
      }),
    ]);
    expect(result.skipped).toEqual([
      'Fleet manager (WhatsApp): the WhatsApp number has not opted in',
      'Fleet manager (SMS): SMS is not available',
    ]);
  });

  it('a resident payer gets a WhatsApp receipt only when opted in', async () => {
    client({
      collection_payments: [payment('contribution', {
        resident_id: 'res-1', full_name: null, phone: null, email: null,
        resident: { first_name: 'Ada', last_name: 'Obi', resident_code: 'R1', email: null, phone_primary: '08031111111' },
      })],
    });
    vi.mocked(isWhatsAppOptedIn).mockResolvedValue(true);
    await queueCollectionPaymentNotices('pay-1');
    expect(isWhatsAppOptedIn).toHaveBeenCalledWith('res-1', '08031111111');
    expect(queued()).toEqual([expect.objectContaining({ channel: 'whatsapp', recipient_id: 'res-1', body: expect.stringContaining('Thank you, Ada Obi') })]);
    // A push notice, so it opens with the receipt header (#1351).
    expect(queued()[0].body).toMatch(/^\*✅ Payment received\*\n\n/);
  });
});
