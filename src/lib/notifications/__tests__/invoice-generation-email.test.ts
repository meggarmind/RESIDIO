import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invoiceGeneratedDeduplicationKey,
  queueInvoiceGeneratedEmail,
} from '@/lib/notifications/invoice-generation-email';
import { addToQueue } from '@/lib/notifications/queue';
import { getSettingValue } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@react-email/render', () => ({ render: vi.fn().mockResolvedValue('<html>invoice</html>') }));
vi.mock('@/emails', () => ({ InvoiceGeneratedEmail: vi.fn(() => null) }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/lib/email', () => ({ getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Estate' }) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({
  addToQueue: vi.fn(),
  PRIORITY: { NORMAL: 5 },
}));

const settingsMock = vi.mocked(getSettingValue);
const addToQueueMock = vi.mocked(addToQueue);
const adminClientMock = vi.mocked(createAdminClient);

const invoice = {
  id: 'invoice-1', invoice_number: 'INV-202608-A1', amount_due: 30000, amount_paid: 0,
  due_date: '2026-08-15', period_start: '2026-08-01', period_end: '2026-08-31',
  resident: { id: 'resident-1', first_name: 'Ada', last_name: 'Resident', email: 'ada@example.com' },
  house: { house_number: 'A1', street: { name: 'Main Street' } },
  invoice_items: [{ description: 'Service charge', amount: 30000 }],
};

const createClient = (existing: unknown = null) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: invoice, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: null }),
  };
  return { from: vi.fn().mockReturnValue(chain), chain };
};

beforeEach(() => {
  vi.clearAllMocks();
  settingsMock.mockResolvedValue(true);
});

describe('invoice generation email queue', () => {
  it('uses an invoice-specific stable deduplication key', () => {
    expect(invoiceGeneratedDeduplicationKey('invoice-1')).toBe('invoice-generated:invoice-1');
  });

  it('does not queue when invoice notifications are disabled', async () => {
    settingsMock.mockResolvedValue(false);
    const result = await queueInvoiceGeneratedEmail('invoice-1', 'candidate-1');
    expect(result).toEqual({ status: 'skipped', error: 'Invoice notifications are disabled' });
    expect(addToQueueMock).not.toHaveBeenCalled();
  });

  it('queues one rendered email after the invoice exists', async () => {
    const client = createClient();
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
    addToQueueMock.mockResolvedValue({ success: true, queueId: 'queue-1' });
    const result = await queueInvoiceGeneratedEmail('invoice-1', 'candidate-1');
    expect(result).toEqual({ status: 'queued', queueId: 'queue-1' });
    expect(addToQueueMock).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: 'resident-1',
      recipient_email: 'ada@example.com',
      deduplication_key: 'invoice-generated:invoice-1',
      metadata: expect.objectContaining({ candidateId: 'candidate-1', invoiceId: 'invoice-1' }),
    }));
  });

  it('reuses an existing queue item when a concurrent insert wins', async () => {
    const client = createClient({ id: 'queue-existing', status: 'pending' });
    adminClientMock.mockReturnValue(client as unknown as ReturnType<typeof createAdminClient>);
    addToQueueMock.mockResolvedValue({ success: false, error: 'duplicate key value violates unique constraint' });
    const result = await queueInvoiceGeneratedEmail('invoice-1', 'candidate-1');
    expect(result).toMatchObject({ status: 'queued', queueId: 'queue-existing' });
    expect(client.chain.maybeSingle).toHaveBeenCalledTimes(1);
  });
});
