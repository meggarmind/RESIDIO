/** #1455: View receipt signs a short-lived URL for a payment's proof, only for payments.update holders. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  maybeSingle: vi.fn(),
  createSignedUrl: vi.fn(),
  bucket: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
    storage: {
      from: (bucket: string) => {
        mocks.bucket(bucket);
        return { createSignedUrl: mocks.createSignedUrl };
      },
    },
  }),
}));

import { getPaymentProofUrl } from '@/actions/payments/get-payment-proof-url';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PAYMENT = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.maybeSingle.mockResolvedValue({ data: { proof_url: 'whatsapp/resident-1/proof.jpg' }, error: null });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.test/signed/proof.jpg' }, error: null });
});

describe('getPaymentProofUrl', () => {
  it('signs the proof path in payment-proofs for five minutes', async () => {
    expect(await getPaymentProofUrl(PAYMENT)).toEqual({ url: 'https://storage.test/signed/proof.jpg', error: null });
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.PAYMENTS_UPDATE);
    expect(mocks.bucket).toHaveBeenCalledWith('payment-proofs');
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('whatsapp/resident-1/proof.jpg', 300);
  });

  it('refuses without the permission, before reading the payment or signing anything', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: "Unauthorized: Missing permission 'payments.update'" });
    expect(await getPaymentProofUrl(PAYMENT)).toEqual({ url: null, error: "Unauthorized: Missing permission 'payments.update'" });
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('says so when the payment has no receipt', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { proof_url: null }, error: null });
    expect(await getPaymentProofUrl(PAYMENT)).toEqual({ url: null, error: 'No receipt is attached to this payment' });
    expect(mocks.createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns an error, not a URL, when signing fails', async () => {
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await getPaymentProofUrl(PAYMENT)).toEqual({ url: null, error: 'Could not open the receipt' });
  });
});
