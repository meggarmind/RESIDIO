import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notifyUser } from '@/lib/notifications/user-notifier';
import { notifyResidentOfApprovalOutcome } from '@/lib/whatsapp/resident-outcomes';
import { notifyRequesterOfOutcome } from '@/lib/approvals/notify-requester';

vi.mock('@/lib/notifications/user-notifier', () => ({ notifyUser: vi.fn() }));
vi.mock('@/lib/whatsapp/resident-outcomes', () => ({ notifyResidentOfApprovalOutcome: vi.fn() }));

beforeEach(() => {
  vi.mocked(notifyUser).mockReset();
  vi.mocked(notifyResidentOfApprovalOutcome).mockReset().mockResolvedValue(undefined);
});

describe('notifyRequesterOfOutcome and a resident\'s WhatsApp request (#816)', () => {
  it.each(['approved', 'rejected', 'expired'] as const)('tells the resident by WhatsApp when it is %s, and no admin in-app', async (outcome) => {
    const request = { id: 'request-1', request_type: 'whatsapp_payment_report', requested_by: null };

    await notifyRequesterOfOutcome({ request, outcome, reviewerId: 'admin-1' });

    expect(notifyResidentOfApprovalOutcome).toHaveBeenCalledWith(request, outcome);
    expect(notifyUser).not.toHaveBeenCalled();
  });

  it('returns why the resident\'s WhatsApp message was not sent (#1037)', async () => {
    vi.mocked(notifyResidentOfApprovalOutcome).mockResolvedValue('WhatsApp message to the resident was not sent: WhatsApp daily outbound limit reached');
    const request = { id: 'request-1', request_type: 'whatsapp_payment_report', requested_by: null };
    await expect(notifyRequesterOfOutcome({ request, outcome: 'approved', reviewerId: 'admin-1' })).resolves.toBe(
      'WhatsApp message to the resident was not sent: WhatsApp daily outbound limit reached'
    );
  });

  it('still tells an admin requester in-app', async () => {
    await notifyRequesterOfOutcome({ request: { id: 'request-2', request_type: 'house_plots_change', requested_by: 'maker-1' }, outcome: 'approved', reviewerId: 'admin-1' });
    expect(notifyUser).toHaveBeenCalledTimes(1);
  });
});
