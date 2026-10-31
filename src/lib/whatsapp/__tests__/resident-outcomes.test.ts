import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { closeReportedPayment } from '@/lib/whatsapp/payment-report-settlement';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';
import { notifyResidentOfApprovalOutcome } from '@/lib/whatsapp/resident-outcomes';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/payment-report-settlement', () => ({ closeReportedPayment: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/whatsapp/resident-send', () => ({ sendWhatsAppToResident: vi.fn() }));

function mockDb(results: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'eq']) chain[op] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve((results[table] || []).shift() ?? { data: null, error: null }));
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
}

const request = { id: 'request-1', request_type: 'whatsapp_payment_report' };

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(closeReportedPayment).mockClear();
  vi.mocked(sendWhatsAppToResident).mockReset().mockResolvedValue({ sent: true });
  mockDb({
    approval_requests: [{ data: { entity_id: 'payment-1', requested_by_resident_id: 'resident-1' }, error: null }],
    payment_records: [{ data: { amount: 50000, payment_date: '2026-10-12T11:00:00+00:00' }, error: null }],
  });
});

describe('notifyResidentOfApprovalOutcome for a clearance request (#816)', () => {
  const clearance = { id: 'request-3', request_type: 'clearance_certificate_request' };

  beforeEach(() => {
    mockDb({ approval_requests: [{ data: { entity_id: 'house-1', requested_by_resident_id: 'resident-1', requested_changes: { property: '12 Palm Close' } }, error: null }] });
  });

  it.each(['rejected', 'expired'] as const)('tells the resident the request was not approved when %s', async (outcome) => {
    await notifyResidentOfApprovalOutcome(clearance, outcome);
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your clearance certificate request for 12 Palm Close was not approved. Contact the estate office.', { seed: `approval:request-3:${outcome}` });
    expect(closeReportedPayment).not.toHaveBeenCalled();
  });

  it('says nothing on approval: the certificate itself is the message', async () => {
    await notifyResidentOfApprovalOutcome(clearance, 'approved');
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });
});

describe('notifyResidentOfApprovalOutcome (#816 decision 13)', () => {
  it('tells the resident the payment was confirmed', async () => {
    await notifyResidentOfApprovalOutcome(request, 'approved');
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your payment of ₦50,000.00 on 12 Oct 2026 was confirmed.', { seed: 'approval:request-1:approved', notice: 'payment_confirmed' });
    expect(closeReportedPayment).not.toHaveBeenCalled();
  });

  it('names the houses the payment paid, from the invoices it settled (#1073)', async () => {
    const item = (house: object) => ({ invoice: { house } });
    mockDb({
      approval_requests: [{ data: { entity_id: 'payment-1', requested_by_resident_id: 'resident-1' }, error: null }],
      payment_records: [{ data: { amount: 50000, payment_date: '2026-10-12T11:00:00+00:00' }, error: null }],
      wallet_payment_batches: [{ data: { wallet_payment_batch_items: [item({ house_number: '12', short_name: '12 Palm Close', street: null }), item({ house_number: '4', short_name: null, street: { name: 'Cedar Way' } }), item({ house_number: '12', short_name: '12 Palm Close', street: null })] }, error: null }],
    });
    await notifyResidentOfApprovalOutcome(request, 'approved');
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your payment of ₦50,000.00 on 12 Oct 2026 was confirmed. It paid 12 Palm Close and 4, Cedar Way.', { seed: 'approval:request-1:approved', notice: 'payment_confirmed' });
  });

  it.each(['rejected', 'expired'] as const)('closes the payment and tells the resident it could not be confirmed when %s', async (outcome) => {
    await notifyResidentOfApprovalOutcome(request, outcome);
    expect(closeReportedPayment).toHaveBeenCalledWith('payment-1');
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your payment of ₦50,000.00 on 12 Oct 2026 could not be confirmed. Contact the estate office.', { seed: `approval:request-1:${outcome}`, notice: 'payment_not_confirmed' });
  });

  it('ignores other request types', async () => {
    await notifyResidentOfApprovalOutcome({ id: 'request-2', request_type: 'house_plots_change' }, 'approved');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('sends nothing for a request that has no resident', async () => {
    mockDb({ approval_requests: [{ data: { entity_id: 'payment-1', requested_by_resident_id: null }, error: null }] });
    await notifyResidentOfApprovalOutcome(request, 'approved');
    expect(sendWhatsAppToResident).not.toHaveBeenCalled();
  });

  it('returns why the message was not sent, so the deciding admin sees it (#1037)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, reason: 'WhatsApp daily outbound limit reached' });
    await expect(notifyResidentOfApprovalOutcome(request, 'approved')).resolves.toBe('WhatsApp message to the resident was not sent: WhatsApp daily outbound limit reached');
  });

  it('tells the admin a held-back message is scheduled (#1044)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, deferred: true, reason: 'daily limit. It is scheduled and will send automatically after midnight Lagos time' });
    await expect(notifyResidentOfApprovalOutcome(request, 'approved')).resolves.toBe('WhatsApp message to the resident is held back: daily limit. It is scheduled and will send automatically after midnight Lagos time');
  });

  it('does not throw when the message cannot be sent (no opt-in, no number, provider down)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendWhatsAppToResident).mockRejectedValue(new Error('boom'));
    await expect(notifyResidentOfApprovalOutcome(request, 'approved')).resolves.toBeUndefined();
  });
});
