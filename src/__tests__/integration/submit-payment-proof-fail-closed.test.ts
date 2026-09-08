import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitPaymentProof } from '@/actions/payments/submit-payment-proof';

const { createServerSupabaseClient, logAudit, revalidatePath } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath }));

function createQuery(result: unknown) {
  const query: Record<string, unknown> = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  };

  (query.select as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.insert as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.update as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.eq as ReturnType<typeof vi.fn>).mockReturnValue(query);
  (query.single as ReturnType<typeof vi.fn>).mockResolvedValue(result);

  return query;
}

function buildFormData() {
  const formData = new FormData();
  formData.append('amount', '25000');
  formData.append('proof', new File(['receipt-bytes'], 'receipt.png', { type: 'image/png' }));
  formData.append('notes', 'Transfer on 2026-09-08');
  return formData;
}

/**
 * submitPaymentProof used to call createApprovalRequest with the request type
 * `manual_payment_verification`, which the `approval_request_type` Postgres enum
 * has never held. The insert failed on every submission and the action returned
 * `{ success: true, warning: ... }` -- the portal rendered that as a success
 * toast, so the resident was told their proof was submitted while no admin was
 * ever notified (#107).
 */
describe('submitPaymentProof fails closed when verification cannot be requested', () => {
  let storageRemove: ReturnType<typeof vi.fn>;
  let paymentQuery: ReturnType<typeof createQuery>;

  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    logAudit.mockReset();
    revalidatePath.mockReset();

    const residentQuery = createQuery({
      data: { id: 'res-1', first_name: 'Ada', last_name: 'Obi', profile_id: 'user-1' },
      error: null,
    });
    paymentQuery = createQuery({
      data: { id: 'pay-1', amount: 25000, resident_id: 'res-1' },
      error: null,
    });

    storageRemove = vi.fn().mockResolvedValue({ error: null });

    const from = vi.fn((table: string) =>
      table === 'residents' ? residentQuery : paymentQuery,
    );

    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) },
      from,
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          remove: storageRemove,
        }),
      },
    });
  });

  it('does not return a success-shaped result', async () => {
    const result = await submitPaymentProof(buildFormData());

    expect(result.success).toBe(false);
    // The old silent-success shape must be gone entirely: no truthy `success`,
    // and no `warning` for the caller to render as a success message.
    expect(result).not.toHaveProperty('warning');
    expect(result.error).toEqual(expect.any(String));
    expect(result.error).toContain('#306');
  });

  it('reports the payment id and keeps the record it wrote', async () => {
    const result = await submitPaymentProof(buildFormData());

    expect(result.payment_id).toBe('pay-1');
    // The proof file is evidence of a real transfer: it is not rolled back.
    expect(storageRemove).not.toHaveBeenCalled();
    // ... and the retained row is audited rather than left invisible.
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'payments', entityId: 'pay-1' }),
    );
  });

  it('still rejects invalid input before writing anything', async () => {
    const formData = new FormData();
    formData.append('amount', '0');
    formData.append('proof', new File(['x'], 'receipt.png', { type: 'image/png' }));

    const result = await submitPaymentProof(formData);

    expect(result.error).toContain('valid amount');
    expect(paymentQuery.insert).not.toHaveBeenCalled();
  });
});
