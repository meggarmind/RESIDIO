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

describe('notifyResidentOfApprovalOutcome (#816 decision 13)', () => {
  it('tells the resident the payment was confirmed', async () => {
    await notifyResidentOfApprovalOutcome(request, 'approved');
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your payment of ₦50,000.00 on 12 Oct 2026 was confirmed.', { seed: 'approval:request-1:approved' });
    expect(closeReportedPayment).not.toHaveBeenCalled();
  });

  it.each(['rejected', 'expired'] as const)('closes the payment and tells the resident it could not be confirmed when %s', async (outcome) => {
    await notifyResidentOfApprovalOutcome(request, outcome);
    expect(closeReportedPayment).toHaveBeenCalledWith('payment-1');
    expect(sendWhatsAppToResident).toHaveBeenCalledWith('resident-1', 'Your payment of ₦50,000.00 on 12 Oct 2026 could not be confirmed. Contact the estate office.', { seed: `approval:request-1:${outcome}` });
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

  it('does not throw when the message cannot be sent (no opt-in, no number, provider down)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(sendWhatsAppToResident).mockResolvedValue({ sent: false, reason: 'not opted in' });
    await expect(notifyResidentOfApprovalOutcome(request, 'approved')).resolves.toBeUndefined();
    vi.mocked(sendWhatsAppToResident).mockRejectedValue(new Error('boom'));
    await expect(notifyResidentOfApprovalOutcome(request, 'approved')).resolves.toBeUndefined();
  });
});
