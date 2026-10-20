import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getApprovalHandler } from '@/lib/approvals/registry';
import { settleReportedPayment } from '@/lib/whatsapp/payment-report-settlement';

const { authorizePermission, logAudit } = vi.hoisted(() => ({ authorizePermission: vi.fn(), logAudit: vi.fn() }));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/whatsapp/payment-report-settlement', () => ({ settleReportedPayment: vi.fn() }));

const handler = getApprovalHandler('whatsapp_payment_report')!;
const request = { id: 'request-1', entity_id: 'payment-1' } as never;
const changes = { amount: 50000, payment_date: '2026-10-12', property: '12 Palm Close', reference: 'GTB TRF' };

beforeEach(() => {
  authorizePermission.mockReset().mockResolvedValue({ authorized: true, userId: 'admin-1' });
  logAudit.mockReset();
  vi.mocked(settleReportedPayment).mockReset().mockResolvedValue({ success: true });
});

describe('whatsapp_payment_report approval handler (#816)', () => {
  it('is registered and validates its payload', () => {
    expect(handler.auditEntityType).toBe('payment_records');
    expect(handler.schema.safeParse(changes).success).toBe(true);
    expect(handler.schema.safeParse({ ...changes, amount: 0 }).success).toBe(false);
    expect(handler.schema.safeParse({ amount: 5 }).success).toBe(false);
  });

  it('settles the payment as the approver and audits the verification', async () => {
    const result = await handler.apply(request, changes, {} as never);

    expect(result).toEqual({ success: true, error: null });
    expect(authorizePermission).toHaveBeenCalledWith('payments.verify');
    expect(settleReportedPayment).toHaveBeenCalledWith('payment-1', 'admin-1');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VERIFY', entityType: 'payment_records', entityId: 'payment-1', newValues: expect.objectContaining({ is_verified: true, verified_by: 'admin-1' }) })
    );
  });

  it('refuses an approver without payments.verify, before touching the payment', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, userId: 'admin-2', error: 'Forbidden' });
    const result = await handler.apply(request, changes, {} as never);

    expect(result.success).toBe(false);
    expect(result.error).toContain('payments.verify');
    expect(settleReportedPayment).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('fails, with no audit, when the payment cannot be settled', async () => {
    vi.mocked(settleReportedPayment).mockResolvedValue({ success: false, error: 'The wallet could not be credited: rpc failed' });
    const result = await handler.apply(request, changes, {} as never);

    expect(result).toEqual({ success: false, error: 'The wallet could not be credited: rpc failed' });
    expect(logAudit).not.toHaveBeenCalled();
  });
});
